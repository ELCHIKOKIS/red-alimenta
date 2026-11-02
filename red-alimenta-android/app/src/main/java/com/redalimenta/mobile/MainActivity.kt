package com.redalimenta.mobile

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.lifecycle.viewmodel.compose.viewModel
import com.redalimenta.mobile.data.ApiClient
import com.redalimenta.mobile.ui.RedAlimentaApp

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ApiClient.initialize(applicationContext)
        setContent {
            RedAlimentaApp(viewModel = viewModel())
        }
    }
}
