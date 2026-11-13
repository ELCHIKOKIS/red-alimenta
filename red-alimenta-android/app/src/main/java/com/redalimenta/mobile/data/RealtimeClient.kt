package com.redalimenta.mobile.data

import com.redalimenta.mobile.BuildConfig
import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONObject
import java.net.URI

object RealtimeClient {
    private var socket: Socket? = null
    private var hasConnected = false
    private val recentEventIds = LinkedHashSet<String>()

    @Synchronized
    fun connect(
        token: String,
        onConnectionChanged: (Boolean) -> Unit,
        onDataChanged: () -> Unit,
    ) {
        if (token.isBlank()) return
        if (activeToken == token && socket?.connected() == true) return
        disconnectLocked()

        val options = IO.Options().apply {
            auth = mapOf("token" to token)
            reconnection = true
            reconnectionAttempts = Int.MAX_VALUE
            reconnectionDelay = 1_000
            reconnectionDelayMax = 30_000
            timeout = 20_000
            transports = arrayOf("websocket")
        }
        val client = IO.socket(URI.create(BuildConfig.API_BASE_URL), options)
        socket = client
        activeToken = token
        hasConnected = false

        client.on(Socket.EVENT_CONNECT) {
            val reconnected = synchronized(this) {
                if (socket !== client) {
                    false
                } else {
                    val previousConnection = hasConnected
                    hasConnected = true
                    previousConnection
                }
            }
            onConnectionChanged(true)
            if (reconnected) onDataChanged()
        }
        client.on(Socket.EVENT_DISCONNECT) {
            if (isCurrent(client)) {
                onConnectionChanged(false)
                if (it.firstOrNull() == "io server disconnect") onDataChanged()
            }
        }
        client.on(Socket.EVENT_CONNECT_ERROR) {
            if (isCurrent(client)) onConnectionChanged(false)
        }
        client.on("data:changed") { args ->
            val payload = args.firstOrNull() as? JSONObject ?: return@on
            val eventId = payload.optString("eventId").takeIf { it.isNotBlank() }
                ?: return@on
            val shouldProcess = synchronized(this) {
                if (socket !== client || !recentEventIds.add(eventId)) {
                    false
                } else {
                    if (recentEventIds.size > 128) {
                        recentEventIds.remove(recentEventIds.first())
                    }
                    true
                }
            }
            if (shouldProcess) onDataChanged()
        }
        client.connect()
    }

    @Synchronized
    fun disconnect() {
        disconnectLocked()
    }

    private fun isCurrent(client: Socket): Boolean = synchronized(this) {
        socket === client
    }

    private fun disconnectLocked() {
        val current = socket
        socket = null
        activeToken = null
        hasConnected = false
        recentEventIds.clear()
        current?.off()
        current?.disconnect()
        current?.close()
    }

    private var activeToken: String? = null
}
