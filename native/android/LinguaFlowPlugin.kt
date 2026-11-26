package com.linguaflow.app.bridge

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.result.ActivityResult
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Capacitor Native Bridge for Android (API 29+)
 * Strictly adheres to Android security policies:
 * - Uses MediaProjection + AudioPlaybackCapture only with explicit user consent.
 * - Never uses AccessibilityService to scrape third-party apps or bypass DRM.
 * - Requests SYSTEM_ALERT_WINDOW only when the user explicitly activates Floating Subtitles.
 */
@CapacitorPlugin(name = "LinguaFlowNative")
class LinguaFlowPlugin : Plugin() {

    @PluginMethod
    fun checkCapabilities(call: PluginCall) {
        val ret = JSObject()
        val hasMicPerm = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED
        val canDrawOverlays = Settings.canDrawOverlays(context)
        val supportsPlaybackCapture = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q

        ret.put("os", "android")
        ret.put("sdkInt", Build.VERSION.SDK_INT)
        ret.put("hasMicrophonePermission", hasMicPerm)
        ret.put("hasOverlayPermission", canDrawOverlays)
        ret.put("supportsPlaybackCapture", supportsPlaybackCapture)
        ret.put("supportsFloatingOverlay", true)
        call.resolve(ret)
    }

    @PluginMethod
    fun requestOverlayPermission(call: PluginCall) {
        if (Settings.canDrawOverlays(context)) {
            val ret = JSObject().put("granted", true)
            call.resolve(ret)
            return
        }
        val intent = Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:${context.packageName}")
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        val ret = JSObject()
            .put("granted", false)
            .put("openedSettings", true)
        call.resolve(ret)
    }

    @PluginMethod
    fun startFloatingOverlay(call: PluginCall) {
        if (!Settings.canDrawOverlays(context)) {
            call.reject("Chưa cấp quyền hiển thị trên ứng dụng khác (SYSTEM_ALERT_WINDOW).")
            return
        }
        val serviceIntent = Intent(context, FloatingSubtitleService::class.java).apply {
            action = FloatingSubtitleService.ACTION_START_OVERLAY
            putExtra("fontSize", call.getInt("fontSize") ?: 20)
            putExtra("backgroundOpacity", call.getFloat("backgroundOpacity") ?: 0.78f)
        }
        ContextCompat.startForegroundService(context, serviceIntent)
        call.resolve(JSObject().put("started", true))
    }

    @PluginMethod
    fun updateFloatingSubtitle(call: PluginCall) {
        val translatedText = call.getString("translatedText") ?: ""
        val sourceText = call.getString("sourceText") ?: ""
        val isInterim = call.getBoolean("isInterim") ?: false

        val intent = Intent(context, FloatingSubtitleService::class.java).apply {
            action = FloatingSubtitleService.ACTION_UPDATE_TEXT
            putExtra("translatedText", translatedText)
            putExtra("sourceText", sourceText)
            putExtra("isInterim", isInterim)
        }
        context.startService(intent)
        call.resolve(JSObject().put("updated", true))
    }

    @PluginMethod
    fun stopFloatingOverlay(call: PluginCall) {
        val intent = Intent(context, FloatingSubtitleService::class.java).apply {
            action = FloatingSubtitleService.ACTION_STOP_OVERLAY
        }
        context.startService(intent)
        call.resolve(JSObject().put("stopped", true))
    }

    @PluginMethod
    fun requestPlaybackCapture(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.reject("Thiết bị Android dưới phiên bản 10 không hỗ trợ AudioPlaybackCapture. Hãy dùng chế độ Micro.")
            return
        }
        val mpManager = context.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        val captureIntent = mpManager.createScreenCaptureIntent()
        startActivityForResult(call, captureIntent, "handleMediaProjectionResult")
    }

    @ActivityCallback
    private fun handleMediaProjectionResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        if (result.resultCode == Activity.RESULT_OK && result.data != null) {
            val serviceIntent = Intent(context, FloatingSubtitleService::class.java).apply {
                action = FloatingSubtitleService.ACTION_START_CAPTURE
                putExtra("resultCode", result.resultCode)
                putExtra("resultData", result.data)
            }
            ContextCompat.startForegroundService(context, serviceIntent)
            call.resolve(JSObject().put("capturing", true))
        } else {
            call.resolve(
                JSObject()
                    .put("capturing", false)
                    .put("fallbackSuggested", "microphone")
                    .put("reasonVi", "Người dùng đã từ chối chia sẻ âm thanh màn hình. Bạn có thể chuyển sang chế độ Nghe bằng Micro.")
            )
        }
    }
}
