import { expect, test, type Page } from '@playwright/test';
import { installFakeLanguageModel } from './fake-language-model';

const run = Date.now().toString(36);
const email = (who: string) => `${who}-${run}@example.com`;
const PASSWORD = 'correct-horse-battery';

/** Make cloud Firebase AI Logic calls fail deterministically (there is no real project in emulator mode). */
async function blockCloudAi(page: Page) {
  await page.route(/googleapis\.com\/.*(generateContent|streamGenerateContent)/, (route) => route.abort('internetdisconnected'));
}

async function signUp(page: Page, name: string, address: string) {
  await page.goto('/signup');
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Work email').fill(address);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Set up your workspace' })).toBeVisible();
}

async function createWorkspace(page: Page, name: string) {
  await page.getByLabel('Workspace name').fill(name);
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Your first meeting starts here' })).toBeVisible();
}

async function addSampleMeeting(page: Page, which: 'Sample meeting 1' | 'Sample meeting 2 (follow-up)') {
  await page.goto('/app/meetings/new');
  await page.getByRole('button', { name: which, exact: true }).click();
  await page.getByRole('button', { name: 'Save meeting' }).click();
  await expect(page).toHaveURL(/\/app\/meetings\/[^/]+\?analyze=1/);
}

test.describe.serial('core journey with on-device inference (test double for Chrome built-in model)', () => {
  let page: Page;
  let kickoffUrl = '';

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.addInitScript(installFakeLanguageModel);
    await blockCloudAi(page);
  });

  test('landing page explains the product', async () => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('work getting done');
    await expect(page.getByRole('link', { name: /Get started/ })).toBeVisible();
  });

  test('sign up, create a workspace, see the empty dashboard', async () => {
    await signUp(page, 'Avery Test', email('owner'));
    await createWorkspace(page, 'E2E Team');
    await expect(page.getByText('On-device AI ready')).toBeVisible();
  });

  test('import a transcript and analyse it on-device', async () => {
    await addSampleMeeting(page, 'Sample meeting 1');
    kickoffUrl = page.url().split('?')[0]!;
    await page.getByRole('button', { name: 'Analyse', exact: true }).click();
    await expect(page.getByText('Done.')).toBeVisible();
    // The SDK reported on-device inference; the hallucinated item was discarded by grounding.
    await expect(page.getByText('On this device').first()).toBeVisible();
    await expect(page.getByText(/1 item was discarded because the evidence wasn't found/)).toBeVisible();
    const calls = await page.evaluate(() => (window as unknown as { __lmCalls: { kind: string; hasConstraint: boolean }[] }).__lmCalls);
    expect(calls.some((c) => c.kind === 'extract-kickoff' && c.hasConstraint)).toBe(true);
  });

  test('meeting results persist after reload', async () => {
    await page.goto(kickoffUrl);
    await page.reload();
    await expect(page.getByText(/launch the beta to the waitlist/i).first()).toBeVisible();
    await page.getByRole('tab', { name: /Decisions/ }).click();
    await expect(page.getByText('Beta launches to the waitlist first')).toBeVisible();
    await expect(page.getByText('Agreed by Maya Chen, Priya Raman, Daniel Okafor')).toBeVisible();
  });

  test('commitments carry owners, deadlines and evidence', async () => {
    await page.goto('/app/commitments');
    await expect(page.getByRole('link', { name: 'Finish the landing page' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Chase the payment provider for API keys' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Hire a contract designer' })).toHaveCount(0);
    await page.getByRole('link', { name: 'Chase the payment provider for API keys' }).click();
    // "I" resolved to the speaker of the evidence line.
    await expect(page.getByText('Maya Chen').first()).toBeVisible();
    await expect(page.getByText("I'll chase the payment provider for the API keys tomorrow.").first()).toBeVisible();
  });

  test('a follow-up meeting links to earlier commitments (Commitment Graph)', async () => {
    await addSampleMeeting(page, 'Sample meeting 2 (follow-up)');
    await page.getByRole('button', { name: 'Analyse', exact: true }).click();
    await expect(page.getByText('Done.')).toBeVisible();
    await expect(page.getByText(/updates to earlier commitments/)).toBeVisible();

    await page.goto('/app/commitments');
    await page.getByRole('link', { name: 'Finish the landing page' }).click();
    await expect(page.getByText('Deadline changed 1×')).toBeVisible();
    await expect(page.getByText('Follow-up 1')).toBeVisible();
    await expect(page.getByText("I need more time on the landing page, I'll have it finished by next Wednesday instead.").first()).toBeVisible();
  });

  test('AI never completes a task: a person confirms it', async () => {
    await page.goto('/app/commitments');
    await page.getByRole('link', { name: 'Send final onboarding mockups to Daniel' }).click();
    await expect(page.getByText('A later meeting says this is done. Confirm?')).toBeVisible();
    await expect(page.getByText('Open', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: "Yes, it's done" }).click();
    await expect(page.getByText(/confirmed by Avery Test/)).toBeVisible();
    await expect(page.getByText('Completion confirmed')).toBeVisible();
  });

  test('ask memory a question: cloud unreachable, SDK falls back to on-device, answer is cited', async () => {
    await page.goto('/app/memory');
    await page.getByLabel('Ask a question about your meetings').fill('What did we decide about beta pricing per seat?');
    await page.getByRole('button', { name: 'Ask', exact: true }).click();
    await expect(page.getByText(/twenty-four dollars per seat/).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sources' })).toBeVisible();
    await expect(page.getByText('On this device').first()).toBeVisible();
  });

  test('memory says so when nothing relevant exists (no AI call)', async () => {
    await page.getByLabel('Ask a question about your meetings').fill('zebra quantum xylophone');
    await page.getByRole('button', { name: 'Ask', exact: true }).click();
    await expect(page.getByText("I couldn't find anything about this in your workspace")).toBeVisible();
    await expect(page.getByText('No AI used')).toBeVisible();
  });

  test('execution monitor shows real numbers', async () => {
    await page.goto('/app/execution');
    await expect(page.getByText('Completion rate')).toBeVisible();
    await expect(page.getByText('Repeatedly postponed')).toBeVisible();
    await expect(page.getByRole('cell', { name: /Priya Raman/ })).toBeVisible();
  });

  test('prepare a meeting from workspace records (rule-based agenda) and save it', async () => {
    await page.goto('/app/meetings/new');
    await page.getByLabel('Title').fill('Launch review');
    await page.getByRole('radio', { name: /Schedule only/ }).click();
    await page.getByLabel('Participants').fill('Daniel Okafor');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Schedule meeting' }).click();
    await page.getByRole('main').getByRole('link', { name: 'Prepare' }).click();
    await expect(page.getByText('Outstanding commitments')).toBeVisible();
    await page.getByRole('button', { name: 'Rules' }).click();
    await expect(page.getByText('Generated from rules (no AI)')).toBeVisible();
    await page.getByRole('button', { name: 'Save agenda' }).click();
    await expect(page.getByText('Agenda saved to the meeting')).toBeVisible();
  });

  test('live capture requires explicit consent before recording', async () => {
    await page.goto(kickoffUrl + '/live');
    await expect(page.getByRole('heading', { name: 'Live capture' })).toBeVisible();
    const start = page.getByRole('button', { name: 'Start recording' });
    if (await start.isVisible()) {
      await expect(start).toBeDisabled();
      await page.getByText('Everyone in this meeting knows it is being transcribed and has agreed.').click();
      await expect(start).toBeEnabled();
    } else {
      await expect(page.getByText("This browser doesn't support live speech recognition")).toBeVisible();
    }
  });

  test('another user cannot see this workspace', async ({ browser }) => {
    const other = await browser.newPage();
    await signUp(other, 'Mallory', email('other'));
    await other.goto(kickoffUrl);
    // Not a member: the app shows onboarding instead of the meeting.
    await expect(other.getByRole('heading', { name: 'Set up your workspace' })).toBeVisible();
    // After creating her own workspace she still cannot read the other team's meeting.
    await other.getByLabel('Workspace name').fill('Mallory Inc');
    await other.getByRole('button', { name: 'Create workspace' }).click();
    await expect(other.getByText('Meeting not found')).toBeVisible();
    await other.goto('/app/commitments');
    await expect(other.getByText('No commitments yet')).toBeVisible();
    await other.close();
  });
});

test.describe('without on-device AI', () => {
  test('cloud unreachable: analysis fails clearly and offers retry', async ({ page }) => {
    await blockCloudAi(page);
    await signUp(page, 'Cloud User', email('cloud'));
    await createWorkspace(page, 'Cloud Team');
    await expect(page.getByText('Hybrid · cloud for now')).toBeVisible();
    await addSampleMeeting(page, 'Sample meeting 1');
    await page.getByRole('button', { name: 'Analyse', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect(page.getByText('Analysis failed', { exact: true })).toBeVisible();
  });

  test('on-device only + no built-in model: nothing is sent to the cloud', async ({ page }) => {
    let cloudCalls = 0;
    await page.route(/googleapis\.com\/.*generateContent/, (route) => {
      cloudCalls++;
      return route.abort();
    });
    await page.addInitScript(() => localStorage.setItem('meetos-ai-preference', 'on_device_only'));
    await signUp(page, 'Private User', email('private'));
    await createWorkspace(page, 'Private Team');
    await addSampleMeeting(page, 'Sample meeting 1');
    await expect(page.getByText('On-device only · unavailable').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Analyse', exact: true })).toBeDisabled();
    expect(cloudCalls).toBe(0);
  });
});

test('recovers when a new deploy removed the code file a screen needs', async ({ browser }) => {
  const page = await browser.newPage();
  await signUp(page, 'Deploy Test', email('deploy'));
  await createWorkspace(page, 'Deploy Team');
  // Simulate a tab from the previous deploy: the meeting screen's file is gone (404) once.
  let blocked = 0;
  await page.route(/\/assets\/MeetingDetail-[^/]+\.js$/, (route) => {
    if (blocked++ === 0) return route.fulfill({ status: 404, body: 'Not found' });
    return route.continue();
  });
  await addSampleMeeting(page, 'Sample meeting 1');
  // The app reloads itself and the meeting opens; no error screen.
  await expect(page.getByRole('button', { name: 'Analyse', exact: true })).toBeVisible();
  await expect(page.getByText('Something went wrong on this screen')).toHaveCount(0);
  expect(blocked).toBeGreaterThanOrEqual(2);
  await page.close();
});
