package com.meetos.android.data.local

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow

/**
 * Local cache for offline-friendly lists. Firestore remains the source of
 * truth (and has its own offline cache for writes); Room keeps the last-known
 * meeting and commitment lists available instantly on cold start, even before
 * Firestore has re-established its listeners.
 */
@Entity(tableName = "meetings")
data class CachedMeeting(
    @PrimaryKey val id: String,
    val workspaceId: String,
    val title: String,
    val summary: String,
    val status: String,
    val date: Long,
    val isSample: Boolean,
)

@Entity(tableName = "commitments")
data class CachedCommitment(
    @PrimaryKey val id: String,
    val workspaceId: String,
    val description: String,
    val ownerName: String?,
    val deadline: Long?,
    val status: String,
    val originMeetingTitle: String,
    val meetingCount: Int,
)

@Dao
interface CacheDao {
    @Query("SELECT * FROM meetings WHERE workspaceId = :wid ORDER BY date DESC")
    fun meetings(wid: String): Flow<List<CachedMeeting>>

    @Query("SELECT * FROM commitments WHERE workspaceId = :wid")
    fun commitments(wid: String): Flow<List<CachedCommitment>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putMeetings(items: List<CachedMeeting>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putCommitments(items: List<CachedCommitment>)

    @Query("DELETE FROM meetings WHERE workspaceId = :wid")
    suspend fun clearMeetings(wid: String)

    @Query("DELETE FROM commitments WHERE workspaceId = :wid")
    suspend fun clearCommitments(wid: String)

    @Transaction
    suspend fun replaceMeetings(wid: String, items: List<CachedMeeting>) { clearMeetings(wid); putMeetings(items) }

    @Transaction
    suspend fun replaceCommitments(wid: String, items: List<CachedCommitment>) { clearCommitments(wid); putCommitments(items) }

    @Query("DELETE FROM meetings")
    suspend fun clearAllMeetings()

    @Query("DELETE FROM commitments")
    suspend fun clearAllCommitments()
}

@Database(entities = [CachedMeeting::class, CachedCommitment::class], version = 1, exportSchema = false)
abstract class CacheDatabase : RoomDatabase() {
    abstract fun dao(): CacheDao

    companion object {
        fun create(context: Context): CacheDatabase =
            Room.databaseBuilder(context, CacheDatabase::class.java, "meetos-cache.db").fallbackToDestructiveMigration(true).build()
    }
}
