import Fastify from "fastify";
import WebSocket from "ws";
import dotenv from "dotenv";
import fastifyFormBody from "@fastify/formbody";
import fastifyWs from "@fastify/websocket";
import {send_email } from './tools.js';

// Load environment variables from .env file
dotenv.config();

const { ELEVENLABS_AGENT_ID, ELEVENLABS_API_KEY } = process.env;

// Check for the required ElevenLabs credentials
if (!ELEVENLABS_AGENT_ID) {
console.error("Missing ELEVENLABS_AGENT_ID in environment variables");
process.exit(1);
}

if (!ELEVENLABS_API_KEY) {
console.error("Missing ELEVENLABS_API_KEY in environment variables");
process.exit(1);
}

// Initialize Fastify server
const fastify = Fastify({ logger: true });

// Register plugins
fastify.register(fastifyFormBody);
fastify.register(fastifyWs);

const PORT = process.env.PORT || 8001;

// Root route for health check
fastify.get("/voz-balance/health", async (_, reply) => {
reply.send({ message: "Server is running-balance-port-8001" });
});

// Debug route to list all registered routes
fastify.get("/debug/routes", async (_, reply) => {
const routes = [];
fastify.printRoutes((route) => {
    routes.push(route);
});
reply.send({ routes });
});

// Route to handle incoming calls from Twilio
fastify.all("/voz-balance/inbound_call", async (request, reply) => {
console.log("[TWILIO] 📞 Incoming call received");
console.log("[TWILIO] Method:", request.method);
console.log("[TWILIO] URL:", request.url);
console.log("[TWILIO] Headers:", JSON.stringify(request.headers, null, 2));
console.log("[TWILIO] Query params:", request.query);
console.log("[TWILIO] Body:", request.body);

// Generate TwiML response to connect the call to a WebSocket stream
const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
    <Response>
    <Connect>
        <Stream url="wss://${request.headers.host}/voz-balance/media-stream" />
    </Connect>
    </Response>`;

console.log("[TWILIO] ✅ Sending TwiML response");
reply.type("text/xml").send(twimlResponse);
});


// Endpoint para que ElevenLabs envíe datos del cliente
fastify.post("/voz-balance/send-email", async (request, reply) => {
  try {
    console.log("[API] 📧 Recibida solicitud para enviar datos del cliente");
    console.log("[API] Body:", request.body);
    
    const result = await send_email(request.body);
    
    reply.send({
      success: result.success,
      message: result.message,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error("[API] ❌ Error en endpoint enviar-datos-cliente:", error);
    reply.code(500).send({
      success: false,
      message: "Error interno del servidor",
      error: error.message
    });
  }
});


// WebSocket route for handling media streams from Twilio
fastify.register(async (fastifyInstance) => {
fastifyInstance.get("/voz-balance/media-stream", { websocket: true }, (connection, req) => {
    console.info("[Server] Twilio connected to media stream.");
    console.log("[Server] WebSocket headers:", req.headers);

    let streamSid = null;

    // Connect to ElevenLabs Conversational AI WebSocket
    console.log("[II] Attempting to connect to ElevenLabs with Agent ID:", ELEVENLABS_AGENT_ID);
    console.log("[II] Using API Key:", ELEVENLABS_API_KEY ? `${ELEVENLABS_API_KEY.substring(0, 15)}...` : "NOT SET");
    
    const elevenLabsWs = new WebSocket(
    `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${ELEVENLABS_AGENT_ID}`,
    {
        headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'User-Agent': 'Twilio-WebSocket-Bridge/1.0'
        }
    }
    );

    let isElevenLabsConnected = false;

    // Handle open event for ElevenLabs WebSocket
    elevenLabsWs.on("open", () => {
    console.log("[II] ✅ Connected to Conversational AI successfully!");
    console.log("[II] WebSocket readyState:", elevenLabsWs.readyState);
    isElevenLabsConnected = true;
    // Enviar log para saber que la conexión está lista
    connection.send(JSON.stringify({ event: "server_ready" }));
    });

    // Handle messages from ElevenLabs
    elevenLabsWs.on("message", (data) => {
    try {
        console.log("[II] Mensaje recibido de ElevenLabs:", data.toString());
        const message = JSON.parse(data);
        handleElevenLabsMessage(message, connection);
    } catch (error) {
        console.error("[II] Error parsing message:", error);
    }
    });

    // Handle errors from ElevenLabs WebSocket
    elevenLabsWs.on("error", (error) => {
    console.error("[II] ❌ WebSocket error:", error);
    console.error("[II] Error details:", error.message);
    });

    // Handle close event for ElevenLabs WebSocket
    elevenLabsWs.on("close", (code, reason) => {
    console.log("[II] ❌ Disconnected from ElevenLabs.");
    console.log("[II] Close code:", code);
    console.log("[II] Close reason:", reason.toString());
    isElevenLabsConnected = false;
    
    // Error code meanings
    if (code === 3000) {
        console.error("[II] 🔑 AUTHENTICATION ERROR - Check your API Key and Agent ID");
        console.error("[II] Verify at: https://elevenlabs.io/app");
    } else if (code === 1006) {
        console.error("[II] 🌐 CONNECTION ERROR - Network or server issue");
    } else if (code === 1000) {
        console.log("[II] ✅ NORMAL CLOSURE - Conversation ended normally");
        // Cerrar también la conexión de Twilio cuando la conversación termine normalmente
        setTimeout(() => {
            if (connection.readyState === 1) { // WebSocket OPEN
                console.log("[II] 🔄 Closing Twilio connection after normal ElevenLabs closure");
                connection.close();
            }
        }, 2000); // Esperar 2 segundos para que termine cualquier audio pendiente
    } else {
        console.error("[II] 🚫 OTHER ERROR - Code:", code);
    }
    });

    // Function to handle messages from ElevenLabs
    const handleElevenLabsMessage = (message, connection) => {
    switch (message.type) {
        case "conversation_initiation_metadata":
        console.info("[II] Received conversation initiation metadata.");
        break;
        case "audio":
        if (message.audio_event?.audio_base_64) {
            // Send audio data to Twilio
            const audioData = {
            event: "media",
            streamSid,
            media: {
                payload: message.audio_event.audio_base_64,
            },
            };
            connection.send(JSON.stringify(audioData));
        }
        break;
        case "interruption":
        // Clear Twilio's audio queue
        connection.send(JSON.stringify({ event: "clear", streamSid }));
        break;
        case "ping":
        // Respond to ping events from ElevenLabs
        if (message.ping_event?.event_id) {
            const pongResponse = {
            type: "pong",
            event_id: message.ping_event.event_id,
            };
            elevenLabsWs.send(JSON.stringify(pongResponse));
        }
        break;
        case "agent_tool_request":
        // Detectar cuando el agente quiere usar la herramienta send_email
        if (message.agent_tool_request?.tool_name === "send_email") {
            console.log("[II] 📧 DETECTED: Agent wants to send email with data:", message.agent_tool_request.tool_params);
        }
        break;
        case "agent_tool_response":
        // Detectar respuesta de herramientas
        if (message.agent_tool_response?.tool_name === "send_email") {
            console.log("[II] 📧 EMAIL TOOL RESPONSE:", message.agent_tool_response);
        } else if (message.agent_tool_response?.tool_name === "end_call") {
            console.log("[II] 📞 END CALL TOOL RESPONSE:", message.agent_tool_response);
        }
        break;
    }
    };

    // Handle messages from Twilio
    connection.on("message", async (message) => {
        try {
            // Solo log ocasional para evitar spam
            if (Math.random() < 0.01) { // 1% de las veces
                console.log("[Twilio] Procesando mensaje:", JSON.parse(message).event);
            }
            const data = JSON.parse(message);
            switch (data.event) {
                case "start":
                    // Store Stream SID when stream starts
                    streamSid = data.start.streamSid;
                    console.log(`[Twilio] Stream started with ID: ${streamSid}`);
                    break;
                case "media":
                    // Solo procesar audio si ElevenLabs está conectado
                    if (!isElevenLabsConnected) {
                        // Solo log ocasional para evitar spam y salir del procesamiento
                        if (Math.random() < 0.001) { // 0.1% de las veces
                            console.warn("[Twilio] ⚠️ ElevenLabs desconectado - ignorando audio");
                        }
                        return;
                    }
                    
                    // Route audio from Twilio to ElevenLabs
                    if (elevenLabsWs.readyState === WebSocket.OPEN) {
                        // Solo log ocasional para evitar spam
                        if (Math.random() < 0.01) { // 1% de las veces
                            console.log("[Twilio] ✅ Audio enviado a ElevenLabs");
                        }
                        const audioMessage = {
                            user_audio_chunk: Buffer.from(
                                data.media.payload,
                                "base64"
                            ).toString("base64"),
                        };
                        elevenLabsWs.send(JSON.stringify(audioMessage));
                    } else {
                        // Solo log una vez cuando cambia el estado
                        if (isElevenLabsConnected) {
                            console.warn("[Twilio] ❌ ElevenLabs se desconectó durante la llamada");
                            console.warn("[Twilio] Estado actual:", elevenLabsWs.readyState);
                            isElevenLabsConnected = false;
                        }
                    }
                    break;
                case "stop":
                    // Close ElevenLabs WebSocket when Twilio stream stops
                    elevenLabsWs.close();
                    break;
                default:
                    console.log(`[Twilio] Received unhandled event: ${data.event}`);
            }
        } catch (error) {
            console.error("[Twilio] Error processing message:", error);
        }
    });

    // Handle close event from Twilio
    connection.on("close", () => {
    elevenLabsWs.close();
    console.log("[Twilio] Client disconnected");
    });

    // Handle errors from Twilio WebSocket
    connection.on("error", (error) => {
    console.error("[Twilio] WebSocket error:", error);
    elevenLabsWs.close();
    });
});
});

// Start the Fastify server
fastify.listen({ port: PORT }, (err) => {
if (err) {
    console.error("Error starting server:", err);
    process.exit(1);
}
console.log(`[Server] Listening on port ${PORT}`);
});
