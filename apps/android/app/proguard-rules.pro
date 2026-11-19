# kotlinx.serialization
-keepattributes *Annotation*, InnerClasses
-keepclassmembers @kotlinx.serialization.Serializable class com.meetos.android.** {
    *** Companion;
    kotlinx.serialization.KSerializer serializer(...);
}
