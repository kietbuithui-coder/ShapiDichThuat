package com.linguaflow.app.bridge

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.IBinder
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowInsets
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import kotlin.math.max
import kotlin.math.min

/**
 * Android Foreground Service + Floating Subtitle Overlay (WindowManager)
 * Respects OS Safe Areas (Status bar, Navigation bar, Cutout), supports drag, minimize, pause & immediate stop.
 */
class FloatingSubtitleService : Service() {

    companion object {
        const val CHANNEL_ID = "linguaflow_live_session"
        const val NOTIFICATION_ID = 4102
        const val ACTION_START_OVERLAY = "com.linguaflow.action.START_OVERLAY"
        const val ACTION_UPDATE_TEXT = "com.linguaflow.action.UPDATE_TEXT"
        const val ACTION_PAUSE_SESSION = "com.linguaflow.action.PAUSE_SESSION"
        const val ACTION_RESUME_SESSION = "com.linguaflow.action.RESUME_SESSION"
        const val ACTION_STOP_OVERLAY = "com.linguaflow.action.STOP_OVERLAY"
        const val ACTION_START_CAPTURE = "com.linguaflow.action.START_CAPTURE"
    }

    private var windowManager: WindowManager? = null
    private var containerView: LinearLayout? = null
    private var sourceLineView: TextView? = null
    private var viLineView: TextView? = null
    private var layoutParams: WindowManager.LayoutParams? = null
    private var isPaused = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START_OVERLAY -> {
                val fontSize = intent.getIntExtra("fontSize", 20)
                val opacity = intent.getFloatExtra("backgroundOpacity", 0.78f)
                promoteToForeground("Đang hiển thị phụ đề nổi LINGUA FLOW")
                ensureOverlayView(fontSize, opacity)
            }
            ACTION_UPDATE_TEXT -> {
                if (!isPaused) {
                    val vi = intent.getStringExtra("translatedText").orEmpty()
                    val src = intent.getStringExtra("sourceText").orEmpty()
                    val interim = intent.getBooleanExtra("isInterim", false)
                    sourceLineView?.apply {
                        text = src
                        visibility = if (src.isNotBlank()) View.VISIBLE else View.GONE
                    }
                    viLineView?.apply {
                        text = vi
                        alpha = if (interim) 0.76f else 1.0f
                    }
                }
            }
            ACTION_PAUSE_SESSION -> {
                isPaused = true
                viLineView?.text = "Đã tạm dừng phiên dịch"
                promoteToForeground("Phiên dịch đang tạm dừng")
            }
            ACTION_RESUME_SESSION -> {
                isPaused = false
                promoteToForeground("Đang nghe và dịch trực tiếp")
            }
            ACTION_STOP_OVERLAY -> {
                tearDownOverlayAndStop()
            }
        }
        return START_NOT_STICKY
    }

    private fun ensureOverlayView(fontSizeSp: Int, opacity: Float) {
        if (containerView != null) return
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager

        val bg = GradientDrawable().apply {
            cornerRadius = 32f
            setColor(Color.argb((opacity * 255).toInt().coerceIn(40, 245), 14, 18, 26))
        }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = bg
            setPadding(36, 24, 36, 24)
        }

        val srcTv = TextView(this).apply {
            textSize = max(12f, fontSizeSp * 0.76f)
            setTextColor(Color.parseColor("#CBD5E1"))
            visibility = View.GONE
        }

        val viTv = TextView(this).apply {
            text = "LINGUA FLOW sẵn sàng hiển thị phụ đề…"
            textSize = fontSizeSp.toFloat()
            setTextColor(Color.WHITE)
        }

        root.addView(srcTv)
        root.addView(viTv)

        val params = WindowManager.LayoutParams(
            (resources.displayMetrics.widthPixels * 0.88).toInt(),
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            y = (resources.displayMetrics.heightPixels * 0.72).toInt()
        }

        // Touch Drag with Safe-Area Clamping
        var initialX = 0
        var initialY = 0
        var touchX = 0f
        var touchY = 0f

        root.setOnTouchListener { view, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = params.x
                    initialY = params.y
                    touchX = event.rawX
                    touchY = event.rawY
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val safeTop = getSafeTopInset(view)
                    val safeBottom = resources.displayMetrics.heightPixels - getSafeBottomInset(view) - view.height
                    params.x = initialX + (event.rawX - touchX).toInt()
                    params.y = min(max(safeTop, initialY + (event.rawY - touchY).toInt()), max(safeTop, safeBottom))
                    windowManager?.updateViewLayout(root, params)
                    true
                }
                else -> false
            }
        }

        windowManager?.addView(root, params)
        containerView = root
        sourceLineView = srcTv
        viLineView = viTv
        layoutParams = params
    }

    private fun getSafeTopInset(view: View): Int {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val insets = view.rootWindowInsets?.getInsetsIgnoringVisibility(
                WindowInsets.Type.statusBars() or WindowInsets.Type.displayCutout()
            )
            if (insets != null) return max(48, insets.top + 16)
        }
        return 72
    }

    private fun getSafeBottomInset(view: View): Int {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val insets = view.rootWindowInsets?.getInsetsIgnoringVisibility(
                WindowInsets.Type.navigationBars()
            )
            if (insets != null) return max(64, insets.bottom + 20)
        }
        return 96
    }

    private fun promoteToForeground(statusText: String) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(
                CHANNEL_ID,
                "Phiên dịch trực tiếp LINGUA FLOW",
                NotificationManager.IMPORTANCE_LOW
            )
            nm.createNotificationChannel(ch)
        }

        val pauseAction = PendingIntent.getService(
            this,
            1,
            Intent(this, FloatingSubtitleService::class.java).setAction(
                if (isPaused) ACTION_RESUME_SESSION else ACTION_PAUSE_SESSION
            ),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val stopAction = PendingIntent.getService(
            this,
            2,
            Intent(this, FloatingSubtitleService::class.java).setAction(ACTION_STOP_OVERLAY),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }

        val notification = builder
            .setContentTitle("LINGUA FLOW")
            .setContentText(statusText)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setOngoing(true)
            .addAction(
                android.R.drawable.ic_media_pause,
                if (isPaused) "Tiếp tục" else "Tạm dừng",
                pauseAction
            )
            .addAction(
                android.R.drawable.ic_menu_close_clear_cancel,
                "Kết thúc",
                stopAction
            )
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun tearDownOverlayAndStop() {
        containerView?.let {
            runCatching { windowManager?.removeView(it) }
        }
        containerView = null
        sourceLineView = null
        viLineView = null
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        tearDownOverlayAndStop()
        super.onDestroy()
    }
}
