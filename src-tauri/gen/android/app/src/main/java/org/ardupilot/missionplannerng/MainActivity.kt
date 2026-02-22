package org.ardupilot.missionplannerng

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : TauriActivity() {
  private var safeTop = 0
  private var safeBottom = 0

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    // Force light status bar icons (our app is always dark-themed)
    WindowInsetsControllerCompat(window, window.decorView).isAppearanceLightStatusBars = false

    val density = resources.displayMetrics.density
    ViewCompat.setOnApplyWindowInsetsListener(window.decorView) { _, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
      // Convert physical pixels to CSS dp (WebView uses dp)
      safeTop = (bars.top / density).toInt()
      safeBottom = (bars.bottom / density).toInt()
      injectSafeAreaVars()
      insets
    }

    // Retry injection to handle WebView page-load timing
    val handler = Handler(Looper.getMainLooper())
    for (delay in longArrayOf(100, 500, 1500)) {
      handler.postDelayed({ injectSafeAreaVars() }, delay)
    }
  }

  private fun injectSafeAreaVars() {
    findWebView(window.decorView)?.evaluateJavascript(
      "document.documentElement.style.setProperty('--sat','${safeTop}px');" +
        "document.documentElement.style.setProperty('--sab','${safeBottom}px');",
      null
    )
  }

  private fun findWebView(view: View): WebView? {
    if (view is WebView) return view
    if (view is ViewGroup) {
      for (i in 0 until view.childCount) {
        findWebView(view.getChildAt(i))?.let { return it }
      }
    }
    return null
  }
}
