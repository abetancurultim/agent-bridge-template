import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Configurar el transportador de email (SendGrid)
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.sendgrid.net',
  port: process.env.EMAIL_PORT || 587,
  secure: false, // true para 465, false para otros puertos
  auth: {
    user: process.env.EMAIL_USER || 'apikey',
    pass: process.env.SENDGRID_API_KEY,
  },
});

// Herramienta para que ElevenLabs envíe datos del cliente
export async function send_email(params) {
  const {
    nombre,
    fecha_nacimiento,
    telefono,
    necesidad_dental,
    seguro_dental,
    horario_preferido,
    fecha_preferida,
    notas_adicionales
  } = params;

  console.log('[TOOL] 📧 Enviando datos del cliente:', { nombre, telefono });

  const clientData = {
    nombre,
    fechaNacimiento: fecha_nacimiento,
    telefono,
    necesidadDental: necesidad_dental,
    seguroDental: seguro_dental,
    horarioPreferido: horario_preferido,
    fechaPreferida: fecha_preferida,
    notasAdicionales: notas_adicionales,
    timestamp: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })
  };

  const result = await sendClientDataNotification(clientData);
  
  if (result.success) {
    console.log('[TOOL] ✅ Datos del cliente enviados exitosamente');
    return { 
      success: true, 
      message: 'Los datos del cliente han sido enviados correctamente al equipo de Balance Industry. Se contactarán pronto para confirmar la cita.' 
    };
  } else {
    console.error('[TOOL] ❌ Error al enviar datos:', result.error);
    return { 
      success: false, 
      message: 'Hubo un problema al procesar los datos. Por favor, anote el número para que nos contactemos directamente.' 
    };
  }
}

// Función para enviar notificación de datos recopilados del cliente
export async function sendClientDataNotification(clientData) {
  const {
    nombre,
    fechaNacimiento,
    telefono,
    necesidadDental,
    seguroDental,
    horarioPreferido,
    fechaPreferida,
    callSid,
    duration,
    transcript = 'Transcripción no disponible',
    timestamp = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })
  } = clientData;

  const supervisorEmail = process.env.SUPERVISOR_EMAIL;
  const ccEmail = process.env.EMAIL_CC;
  
  if (!supervisorEmail) {
    console.error('[EMAIL] SUPERVISOR_EMAIL no está configurado en las variables de entorno');
    return { success: false, error: 'Email del supervisor no configurado' };
  }

  const subject = `🦷 Nueva Cita Dental - ${nombre} (${telefono})`;
  
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
      <h2 style="color: #0066cc; text-align: center;">🦷 Balance - Nueva Solicitud de Cita</h2>
      
      <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <h3 style="color: #333; margin-top: 0;">👤 Información del Cliente</h3>
        <p><strong>Nombre:</strong> ${nombre || 'No proporcionado'}</p>
        <p><strong>📞 Teléfono:</strong> ${telefono || 'No proporcionado'}</p>
        <p><strong>🎂 Fecha de Nacimiento:</strong> ${fechaNacimiento || 'No proporcionada'}</p>
        <p><strong>🕐 Fecha y Hora de Llamada:</strong> ${timestamp}</p>
      </div>

      <div style="background-color: #e7f3ff; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <h3 style="color: #333; margin-top: 0;">🦷 Información Dental</h3>
        <p><strong>Necesidad Dental:</strong> ${necesidadDental || 'No especificada'}</p>
        <p><strong>🛡️ Seguro Dental:</strong> ${seguroDental || 'No proporcionado / Sin seguro'}</p>
        <p><strong>📅 Fecha Preferida:</strong> ${fechaPreferida || 'Flexible'}</p>
        <p><strong>🕒 Horario Preferido:</strong> ${horarioPreferido || 'No especificado'}</p>
      </div>

      <div style="background-color: #e8f5e8; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <h3 style="color: #333; margin-top: 0;">📋 Información Importante</h3>
        <p><strong>📍 Ubicación de la Clínica:</strong> Duluth, Georgia</p>
        <p><strong>⏰ Horarios de Atención:</strong></p>
        <ul style="margin: 5px 0 0 20px;">
          <li>Lunes, Miércoles, Viernes: 8:00 AM - 2:00 PM</li>
          <li>Martes, Jueves: 9:00 AM - 4:00 PM</li>
        </ul>
      </div>

      <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #ffc107;">
        <p style="margin: 0;"><strong>⚡ Acción Requerida:</strong> Contactar al cliente para confirmar y agendar la cita dental.</p>
      </div>

      ${transcript && transcript !== 'Transcripción no disponible' ? `
      <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <h3 style="color: #333; margin-top: 0;">📝 Transcripción de la Conversación</h3>
        <div style="background-color: white; padding: 10px; border-radius: 3px; border-left: 4px solid #007bff;">
          <pre style="white-space: pre-wrap; font-family: inherit; margin: 0; font-size: 14px;">${transcript}</pre>
        </div>
      </div>
      ` : ''}

      <hr style="margin: 30px 0; border: 0; border-top: 1px solid #eee;">
      
      <p style="text-align: center; color: #6c757d; font-size: 12px;">
        🤖 Balance Industry - Sistema Automatizado de Notificaciones<br>
        Call SID: ${callSid || 'N/A'}<br>
        ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}
      </p>
    </div>
  `;

  const textContent = `
NUEVA SOLICITUD DE CITA DENTAL - BALANCE INDUSTRY

Información del Cliente:
- Nombre: ${nombre || 'No proporcionado'}
- Teléfono: ${telefono || 'No proporcionado'}
- Fecha de Nacimiento: ${fechaNacimiento || 'No proporcionada'}
- Fecha y Hora de Llamada: ${timestamp}
- Duración: ${duration || 'No disponible'}

Información Dental:
- Necesidad: ${necesidadDental || 'No especificada'}
- Seguro: ${seguroDental || 'No proporcionado / Sin seguro'}
- Fecha Preferida: ${fechaPreferida || 'Flexible'}
- Horario Preferido: ${horarioPreferido || 'No especificado'}

ACCIÓN REQUERIDA: Contactar al cliente para confirmar y agendar la cita dental.

Transcripción:
${transcript}

Call SID: ${callSid || 'N/A'}
  `;

  const mailOptions = {
    from: process.env.EMAIL_FROM || '"Balance Industry" <grow@ultimmarketing.com>',
    to: supervisorEmail,
    cc: ccEmail || undefined, // Solo agregar CC si está configurado
    subject: subject,
    text: textContent,
    html: htmlContent,
  };

  try {
    console.log(`[EMAIL] Enviando notificación de datos del cliente: ${nombre} (${telefono})`);
    if (ccEmail) {
      console.log(`[EMAIL] Enviando copia a: ${ccEmail}`);
    }
    const info = await transporter.sendMail(mailOptions);
    console.log(`[EMAIL] ✅ Correo enviado exitosamente: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[EMAIL] ❌ Error al enviar correo:`, error);
    return { success: false, error: error.message };
  }
}

// Función para probar la configuración de email
export async function testEmailConfiguration() {
  try {
    await transporter.verify();
    console.log('[EMAIL] ✅ Configuración de email verificada correctamente');
    return { success: true };
  } catch (error) {
    console.error('[EMAIL] ❌ Error en la configuración de email:', error);
    return { success: false, error: error.message };
  }
}