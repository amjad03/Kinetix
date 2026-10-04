# Used only when R8 is turned on (-Pkinetix.minify=true, see android/app/build.gradle.kts).
# Most plugins (Firebase, flutter_secure_storage, file/image picker) ship their own consumer rules;
# Razorpay's checkout SDK needs these (https://razorpay.com/docs/payments/payment-gateway/android-integration/standard/).
-keepattributes *Annotation*
-dontwarn com.razorpay.**
-keep class com.razorpay.** {*;}
-optimizations !method/inlining/
-keepclasseswithmembers class * {
  public void onPayment*(...);
}
