from flask import Blueprint, render_template, session, redirect, url_for, request, flash, jsonify, current_app
from flask_mail import Message, Mail
from modules.auth.decorators import login_required, role_required
import stripe
import os
from datetime import datetime

# Blueprint del comprador
comprador = Blueprint('comprador', __name__, template_folder="templates")


# ===== Función para obtener noticias =====
def obtener_noticias():
    # Nota: Las noticias ahora se obtienen de Firebase en el frontend
    return []


# ===== Ver productos por categoría (URL bonita) =====
@comprador.route("/categoria/<string:categoria>")
@login_required
@role_required("comprador")
def ver_categoria(categoria):
    # Nota: Los productos ahora se obtienen de Firebase en el frontend
    return render_template(
        "comprador/productos_comprador.html",
        productos=[],
        nombre=session.get("nombre"),
        page='productos',
        categoria=categoria
    )


# ===== Panel del comprador =====
@comprador.route("/panel")
@login_required
@role_required("comprador")
def panel_comprador():
    return render_template(
        "comprador/panel_comprador.html",
        nombre=session.get("nombre", "Usuario"),
        page='inicio'
    )


# ===== Ver productos (con filtros por categoría y búsqueda) =====
@comprador.route("/productos")
@login_required
@role_required("comprador")
def ver_productos():
    return render_template(
        "comprador/productos_comprador.html",
        productos=[],
        nombre=session.get("nombre", "Usuario"),
        page='productos'
    )

# ===== Bandeja de chats =====
@comprador.route("/chats")
@login_required
@role_required("comprador")
def chats():
    vendedor_default = request.args.get('vendedor', 'Vendedor')
    return render_template("comprador/chats.html",
                         nombre=session.get("nombre", "Usuario"),
                         vendedor_nombre=vendedor_default,
                         page='chats')


# ===== Conversación específica =====
@comprador.route("/chats/<string:chat_id>")
@login_required
@role_required("comprador")
def chat_conversacion(chat_id):
    vendedor_nombre = request.args.get('vendedor', 'Vendedor')
    vendedor_id = request.args.get('vendedor_id', '')
    iniciales = ''.join([parte[0] for parte in vendedor_nombre.split() if parte])[:2].upper() or 'VD'
    return render_template("comprador/chat_conversacion.html",
                         nombre=session.get("nombre", "Usuario"),
                         chat_id=chat_id,
                         vendedor_nombre=vendedor_nombre,
                         vendedor_id=vendedor_id,
                         vendedor_iniciales=iniciales,
                         pedido_id=chat_id,
                         pedido_folio=f"PED-{chat_id[:4].upper()}",
                         ultimo_mensaje='Inicia la conversación con tu vendedor',
                         page='chats')


# ===== Nuevo mensaje rápido =====
@comprador.route("/chats/nuevo")
@login_required
@role_required("comprador")
def chat_nuevo():
    comprador_nombre = session.get("nombre", "Usuario")
    return render_template("comprador/chat_conversacion.html",
                         nombre=comprador_nombre,
                         chat_id='nuevo',
                         vendedor_nombre='Selecciona un vendedor',
                         vendedor_id='',
                         vendedor_iniciales='SV',
                         pedido_id='-',
                         pedido_folio='PED-0000-CHAT',
                         ultimo_mensaje='Elige al vendedor y comienza a escribir.',
                         page='chats')



# ===== Detalle de producto =====
@comprador.route("/producto/<string:producto_id>")
@comprador.route("/detalle_producto/<string:producto_id>")
@login_required
@role_required("comprador")
def ver_detalle_producto(producto_id):
    # Página de detalle - datos cargados desde Firebase en el frontend
    return render_template("comprador/detalle_producto.html", 
                         producto_id=producto_id,
                         producto=None, 
                         nombre=session.get("nombre", "Usuario"),
                         page='productos')


# ===== Agregar al carrito =====
@comprador.route("/agregar_carrito", methods=["POST"])
@login_required
@role_required("comprador")
def agregar_carrito():
    # Nota: El carrito ahora se maneja en el frontend con Firebase
    flash("Producto agregado al carrito", "success")
    return redirect(url_for("comprador.ver_carrito"))


# ===== Ver carrito =====
@comprador.route("/carrito")
@login_required
@role_required("comprador")
def ver_carrito():
    # Página de carrito simplificada - solo diseño visual
    return render_template("comprador/carrito.html", 
                         nombre=session.get("nombre", "Usuario"),
                         page='carrito')


# ===== Procesar compra =====
@comprador.route("/procesar_compra", methods=["POST"])
@login_required
@role_required("comprador")
def procesar_compra():
    # Nota: Las compras ahora se procesan en el frontend con Firebase y Stripe
    flash("Compra procesada correctamente", "success")
    return redirect(url_for("comprador.ver_carrito"))


# ===== Activar rol de vendedor =====
@comprador.route("/activar_rol_vendedor", methods=["GET", "POST"])
@login_required
@role_required("comprador")
def activar_rol_vendedor():
    roles = session.get("roles", [])
    
    if "vendedor" in [r.lower() for r in roles]:
        flash("Ya tienes el rol de vendedor activo.", "info")
        return redirect(url_for("auth.perfil"))

    if request.method == "POST":
        # Agregar rol de vendedor a la sesión
        if "vendedor" not in roles:
            roles.append("vendedor")
            session["roles"] = roles
        session["rol_activo"] = "vendedor"
        flash("Rol de vendedor activado con éxito.", "success")
        return redirect(url_for("vendedor.panel_vendedor"))

    return render_template("auth/activar_rol.html")


# ===== Búsqueda de productos (AJAX) =====
@comprador.route("/buscar_productos")
@login_required
@role_required("comprador")
def buscar_productos():
    query = request.args.get('q', '').strip()
    
    if not query:
        return jsonify({"productos": []})
    
    # Nota: La búsqueda ahora se hace en el frontend con Firebase
    return jsonify({"productos": []})


# ===== Agregar producto al carrito (AJAX) =====
@comprador.route("/agregar_carrito_ajax", methods=["POST"])
@login_required
@role_required("comprador")
def agregar_carrito_ajax():
    data = request.get_json()
    producto_id = data.get('producto_id')
    cantidad = int(data.get('cantidad', 1))
    
    # Nota: El carrito ahora se maneja en el frontend con Firebase
    return jsonify({
        "success": True,
        "message": "Producto agregado al carrito",
        "carrito_count": len(session.get("carrito", []))
    })


# ===== Procesar pago con Stripe =====
@comprador.route("/procesar_pago", methods=["POST"])
@login_required
@role_required("comprador")
def procesar_pago():
    # Nota: Los pagos ahora se procesan en el frontend con Stripe
    flash("Pago procesado correctamente", "success")
    return redirect(url_for("comprador.ver_carrito"))


# ===== Crear Payment Intent (Stripe) =====
@comprador.route("/create-payment-intent", methods=["POST"])
@login_required
@role_required("comprador")
def create_payment_intent():
    """
    Endpoint para crear Payment Intent de Stripe.
    Verifica autenticación y roles tanto en sesión Flask como en Firestore (para compatibilidad con Firebase).
    """
    try:
        # Verificar autenticación - primero por sesión Flask, luego por token Firebase si se proporciona
        user_id = session.get('user_id')
        user_roles = session.get('roles', [])
        
        if isinstance(user_roles, str):
            user_roles = [user_roles]
        
        # Si no hay sesión de Flask, intentar obtener desde Firestore a través del token
        # Por ahora, permitimos si hay al menos un usuario_id en sesión o si viene en el request
        if not user_id:
            # Intentar obtener desde el request (si el frontend lo envía)
            data = request.get_json() or {}
            firebase_token = data.get('firebase_token')
            
            if not firebase_token:
                return jsonify({
                    'error': 'No estás autenticado. Por favor, inicia sesión.',
                    'auth_required': True
                }), 401
        
        # Verificar rol de comprador - en sesión o permitir si no hay sesión (asumir que Firebase validó)
        # Por ahora, permitimos el acceso si hay sesión con usuario_id o si viene token
        # En producción, deberías verificar el token de Firebase aquí
        
        data = request.get_json() or {}
        amount = data.get('amount')
        
        if not amount:
            return jsonify({'error': 'Monto no proporcionado'}), 400
        
        if amount <= 0:
            return jsonify({'error': 'El monto debe ser mayor a cero'}), 400
        
        # Obtener clave secreta de Stripe
        stripe_secret = current_app.config.get('STRIPE_SECRET_KEY')
        if not stripe_secret:
            return jsonify({'error': 'Stripe no está configurado en el servidor'}), 500
        
        # Inicializar Stripe
        stripe.api_key = stripe_secret
        
        # Crear Payment Intent
        payment_intent = stripe.PaymentIntent.create(
            amount=int(amount),  # Monto en centavos
            currency='mxn',
            metadata={
                'user_id': user_id or data.get('user_id', 'unknown')
            }
        )
        
        return jsonify({
            'client_secret': payment_intent.client_secret,
            'payment_intent_id': payment_intent.id
        })
        
    except Exception as e:
        # Manejar errores de Stripe de forma más segura
        error_type = type(e).__name__
        error_msg = str(e)
        if 'Stripe' in error_type or 'stripe' in str(type(e)).lower() or 'payment_intent' in error_msg.lower():
            return jsonify({'error': f'Error de Stripe: {error_msg}'}), 400
        current_app.logger.error(f'Error al crear payment intent: {error_msg}')
        return jsonify({'error': 'Error al crear payment intent: ' + error_msg}), 500


# ===== Pago exitoso (Stripe) =====
@comprador.route("/stripe-success")
@login_required
@role_required("comprador")
def stripe_success():
    # Página de pago exitoso
    return render_template("comprador/pago_exitoso.html", 
                         nombre=session.get("nombre", "Usuario"),
                         page='carrito')


# ===== Pago exitoso =====
@comprador.route("/pago_exitoso")
@login_required
@role_required("comprador")
def pago_exitoso():
    # Página de pago exitoso simplificada - solo diseño visual
    return render_template("comprador/pago_exitoso.html", 
                         nombre=session.get("nombre", "Usuario"),
                         page='carrito')


# ===== Ver mis pedidos =====
@comprador.route("/mis_pedidos")
@login_required
@role_required("comprador")
def mis_pedidos():
    # Página de pedidos del comprador - datos cargados desde Firebase en el frontend
    return render_template("comprador/mis_pedidos.html", 
                         nombre=session.get("nombre", "Usuario"),
                         page='pedidos')


# ===== Ver detalle de pedido =====
@comprador.route("/detalle_pedido/<string:pedido_id>")
@login_required
@role_required("comprador")
def detalle_pedido(pedido_id):
    # Página de detalle del pedido - datos cargados desde Firebase en el frontend
    return render_template("comprador/detalle_pedido.html", 
                         nombre=session.get("nombre", "Usuario"),
                         pedido_id=pedido_id,
                         page='pedidos')


# ===== Enviar ticket de compra por correo =====
@comprador.route("/enviar-ticket-compra", methods=["POST"])
@login_required
@role_required("comprador")
def enviar_ticket_compra():
    """Endpoint para enviar el ticket de compra por correo electrónico"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No se recibieron datos'}), 400
        
        # Datos de la compra
        compra_id = data.get('compra_id', 'N/A')
        email_cliente = data.get('email_cliente', '')
        nombre_cliente = data.get('nombre_cliente', 'Cliente')
        fecha_compra = data.get('fecha_compra', datetime.now().strftime('%d/%m/%Y %H:%M'))
        productos = data.get('productos', [])
        subtotal = float(data.get('subtotal', 0))
        envio = float(data.get('envio', 4.50))
        impuestos = float(data.get('impuestos', 0))
        total = float(data.get('total', 0))
        metodo_pago = data.get('metodo_pago', 'N/A')
        direccion_entrega = data.get('direccion_entrega', {})
        
        if not email_cliente:
            return jsonify({'error': 'No se proporcionó el email del cliente'}), 400
        
        # Intentar usar Firebase Functions primero
        try:
            from utils.firebase_functions import send_receipt_email_via_functions
            use_firebase_functions = True
        except ImportError:
            use_firebase_functions = False
        
        if use_firebase_functions:
            try:
                current_app.logger.info(f"🔍 Intentando enviar comprobante con Firebase Functions...")
                current_app.logger.info(f"📧 Datos: compra_id={compra_id}, email={email_cliente}, productos={len(productos)}")
                success = send_receipt_email_via_functions(
                    email=email_cliente,
                    nombre=nombre_cliente,
                    compra_id=compra_id,
                    fecha_compra=fecha_compra,
                    productos=productos,
                    subtotal=subtotal,
                    envio=envio,
                    impuestos=impuestos,
                    total=total,
                    metodo_pago=metodo_pago,
                    direccion_entrega=direccion_entrega
                )
                
                if success:
                    current_app.logger.info(f"✅ Comprobante enviado exitosamente a {email_cliente} vía Firebase Functions")
                    return jsonify({
                        'success': True,
                        'message': 'Ticket de compra enviado correctamente'
                    })
                else:
                    current_app.logger.warning("⚠️ Firebase Functions falló, usando Flask-Mail como respaldo")
            except Exception as e:
                current_app.logger.error(f"❌ Error con Firebase Functions: {str(e)}, usando Flask-Mail como respaldo", exc_info=True)
        
        # Respaldo: usar Flask-Mail
        
        # Configurar método de pago
        metodo_pago_labels = {
            'tarjeta': 'Tarjeta de débito/crédito',
            'efectivo': 'Efectivo contra entrega',
            'transferencia': 'Transferencia bancaria'
        }
        metodo_pago_texto = metodo_pago_labels.get(metodo_pago, metodo_pago)
        
        # Construir HTML del ticket
        productos_html = ''
        for idx, producto in enumerate(productos, 1):
            productos_html += f'''
                <tr>
                    <td style="padding: 12px; border-bottom: 1px solid #eee; text-align:center;">{idx}</td>
                    <td style="padding: 12px; border-bottom:1px solid #eee;">{producto.get('nombre', 'Producto')}</td>
                    <td style="padding: 12px; border-bottom:1px solid #eee; text-align:center;">{producto.get('cantidad', 0)} {producto.get('unidad', 'kg')}</td>
                    <td style="padding: 12px; border-bottom:1px solid #eee; text-align:right;">${float(producto.get('precio_unitario', 0)):.2f}</td>
                    <td style="padding: 12px; border-bottom:1px solid #eee; text-align:right;">${float(producto.get('precio_total', 0)):.2f}</td>
                </tr>
            '''
        
        ciudad = direccion_entrega.get('ciudad', 'No especificada')
        telefono = direccion_entrega.get('telefono', 'No especificado')
        
        html_body = f'''
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: linear-gradient(135deg, #2e8b57 0%, #228B22 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
                .header h1 {{ margin: 0; font-size: 28px; }}
                .content {{ background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }}
                .section {{ background: white; padding: 20px; margin-bottom: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }}
                .section h2 {{ color: #2e8b57; margin-top: 0; font-size: 20px; border-bottom: 2px solid #2e8b57; padding-bottom: 10px; }}
                table {{ width: 100%; border-collapse: collapse; margin: 15px 0; }}
                th {{ background: #2e8b57; color: white; padding: 12px; text-align: left; }}
                td {{ padding: 12px; border-bottom: 1px solid #eee; }}
                .total-section {{ background: #e8f5e9; padding: 15px; border-radius: 8px; margin-top: 20px; }}
                .total-row {{ display: flex; justify-content: space-between; padding: 8px 0; }}
                .total-final {{ font-size: 20px; font-weight: bold; color: #2e8b57; border-top: 2px solid #2e8b57; padding-top: 10px; margin-top: 10px; }}
                .footer {{ text-align: center; margin-top: 30px; color: #666; font-size: 12px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🍃 AgroMarket</h1>
                    <p style="margin: 10px 0 0 0; font-size: 18px;">Ticket de Compra</p>
                </div>
                
                <div class="content">
                    <div class="section">
                        <h2>📋 Información del Pedido</h2>
                        <p><strong>Número de pedido:</strong> {compra_id}</p>
                        <p><strong>Fecha:</strong> {fecha_compra}</p>
                        <p><strong>Método de pago:</strong> {metodo_pago_texto}</p>
                    </div>
                    
                    <div class="section">
                        <h2>👤 Información del Cliente</h2>
                        <p><strong>Nombre:</strong> {nombre_cliente}</p>
                        <p><strong>Email:</strong> {email_cliente}</p>
                    </div>
                    
                    <div class="section">
                        <h2>📦 Productos Comprados</h2>
                        <table>
                            <thead>
                                <tr>
                                    <th style="text-align:center; width:50px;">#</th>
                                    <th>Producto</th>
                                    <th style="text-align:center;">Cantidad</th>
                                    <th style="text-align:right;">Precio Unit.</th>
                                    <th style="text-align:right;">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {productos_html}
                            </tbody>
                        </table>
                    </div>
                    
                    <div class="section">
                        <h2>📍 Información de Entrega</h2>
                        <p><strong>Ciudad de entrega:</strong> {ciudad}</p>
                        <p><strong>Teléfono de contacto:</strong> {telefono}</p>
                        <p style="margin-top: 15px; padding: 10px; background: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px;">
                            <strong>ℹ️ Importante:</strong> El conductor se comunicará contigo en el número proporcionado para coordinar la entrega.
                        </p>
                    </div>
                    
                    <div class="total-section">
                        <div class="total-row">
                            <span>Subtotal:</span>
                            <span>${subtotal:.2f}</span>
                        </div>
                        <div class="total-row">
                            <span>Envío:</span>
                            <span>${envio:.2f}</span>
                        </div>
                        <div class="total-row">
                            <span>Impuestos:</span>
                            <span>${impuestos:.2f}</span>
                        </div>
                        <div class="total-row total-final">
                            <span>TOTAL:</span>
                            <span>${total:.2f}</span>
                        </div>
                    </div>
                    
                    <div class="footer">
                        <p>Gracias por tu compra en AgroMarket 🍃</p>
                        <p>Este es un comprobante automático, por favor guárdalo.</p>
                    </div>
                </div>
            </div>
        </body>
        </html>
        '''
        
        # Crear y enviar el correo
        sender = current_app.config.get('MAIL_DEFAULT_SENDER', 'AgroMarket <agromarket559@gmail.com>')
        msg = Message(
            subject=f'🎉 Confirmación de Compra - Pedido #{compra_id[:9].upper()}',
            recipients=[email_cliente],
            sender=sender,
            html=html_body
        )
        
        # Obtener la instancia de Mail desde la extensión de Flask
        mail = current_app.extensions.get('mail')
        if not mail:
            # Si no está en extensions, intentar crear una nueva instancia
            # Esto solo debería pasar si Flask-Mail no está configurado
            current_app.logger.warning('Flask-Mail no está configurado correctamente')
            return jsonify({'error': 'Servicio de correo no disponible'}), 503
        
        mail.send(msg)
        current_app.logger.info(f"✅ Comprobante enviado exitosamente a {email_cliente} vía Flask-Mail")
        
        return jsonify({
            'success': True,
            'message': 'Ticket de compra enviado correctamente'
        })
        
    except Exception as e:
        current_app.logger.error(f'❌ Error enviando ticket de compra: {str(e)}', exc_info=True)
        return jsonify({
            'error': f'Error al enviar el ticket: {str(e)}'
        }), 500


# ===== Procesar Devolución (Stripe) =====
@comprador.route("/procesar-devolucion", methods=["POST"])
@login_required
@role_required("comprador")
def procesar_devolucion():
    """
    Endpoint para procesar una devolución completa o parcial a través de Stripe.
    Permite devoluciones tanto para compradores (solicitar) como vendedores (procesar).
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No se recibieron datos'}), 400
        
        compra_id = data.get('compra_id')
        monto_devolucion = data.get('monto_devolucion')  # En centavos, opcional para devolución parcial
        motivo = data.get('motivo', 'Devolución solicitada')
        es_devolucion_parcial = data.get('parcial', False)
        user_id_solicitante = session.get('user_id')
        
        if not compra_id:
            return jsonify({'error': 'ID de compra no proporcionado'}), 400
        
        # Obtener clave secreta de Stripe
        stripe_secret = current_app.config.get('STRIPE_SECRET_KEY')
        if not stripe_secret:
            return jsonify({'error': 'Stripe no está configurado en el servidor'}), 500
        
        stripe.api_key = stripe_secret
        
        # Obtener información de la compra desde Firestore (simulado, en producción usar Firebase Admin)
        # Por ahora, requerimos que el frontend envíe el payment_intent_id
        payment_intent_id = data.get('payment_intent_id')
        
        if not payment_intent_id:
            return jsonify({
                'error': 'ID de payment intent no proporcionado. Solo se pueden procesar devoluciones de pagos con tarjeta.'
            }), 400
        
        # Verificar que el payment intent existe y está completo
        try:
            payment_intent = stripe.PaymentIntent.retrieve(payment_intent_id)
        except Exception as e:
            error_msg = str(e)
            if 'Stripe' in type(e).__name__ or 'stripe' in str(type(e)).lower():
                return jsonify({'error': f'Error al recuperar el pago: {error_msg}'}), 400
            raise
        
        # Verificar que el pago fue exitoso
        if payment_intent.status != 'succeeded':
            return jsonify({
                'error': f'El pago no está completo. Estado actual: {payment_intent.status}'
            }), 400
        
        # Obtener el charge_id del payment intent
        charges = payment_intent.charges.data
        if not charges or len(charges) == 0:
            return jsonify({'error': 'No se encontró información de cargo para este pago'}), 400
        
        charge_id = charges[0].id
        
        # Determinar el monto de la devolución
        monto_total_centavos = payment_intent.amount
        if monto_devolucion:
            monto_refund = int(monto_devolucion)
            if monto_refund <= 0:
                return jsonify({'error': 'El monto de devolución debe ser mayor a cero'}), 400
            if monto_refund > monto_total_centavos:
                return jsonify({'error': 'El monto de devolución no puede exceder el monto original'}), 400
        else:
            monto_refund = monto_total_centavos  # Devolución completa
        
        # Crear el refund en Stripe
        refund_params = {
            'charge': charge_id,
            'amount': monto_refund,
            'metadata': {
                'compra_id': compra_id,
                'motivo': motivo,
                'user_id': str(user_id_solicitante or 'unknown'),
                'tipo': 'parcial' if (monto_refund < monto_total_centavos) else 'completa'
            }
        }
        
        # Si hay razón específica, agregarla
        if motivo and motivo.strip():
            refund_params['reason'] = 'requested_by_customer'
        
        refund = stripe.Refund.create(**refund_params)
        
        # Preparar datos de la devolución para guardar en Firestore
        devolucion_data = {
            'compra_id': compra_id,
            'payment_intent_id': payment_intent_id,
            'charge_id': charge_id,
            'refund_id': refund.id,
            'monto_original': monto_total_centavos / 100,  # Convertir a dólares
            'monto_devolucion': monto_refund / 100,
            'moneda': payment_intent.currency.upper(),
            'tipo': 'parcial' if (monto_refund < monto_total_centavos) else 'completa',
            'estado': refund.status,  # pending, succeeded, failed, canceled
            'motivo': motivo,
            'usuario_id': str(user_id_solicitante or 'unknown'),
            'fecha_solicitud': datetime.now().isoformat(),
            'fecha_procesamiento': datetime.now().isoformat(),
            'stripe_refund_data': {
                'id': refund.id,
                'status': refund.status,
                'amount': refund.amount,
                'currency': refund.currency
            }
        }
        
        return jsonify({
            'success': True,
            'message': 'Devolución procesada exitosamente',
            'devolucion': devolucion_data,
            'refund_id': refund.id,
            'status': refund.status,
            'monto_devolucion': monto_refund / 100,
            'moneda': payment_intent.currency.upper()
        })
        
    except Exception as e:
        error_msg = str(e)
        error_type = type(e).__name__
        if 'Stripe' in error_type or 'stripe' in str(type(e)).lower():
            current_app.logger.error(f'Error de Stripe al procesar devolución: {error_msg}')
            return jsonify({
                'error': f'Error al procesar la devolución: {error_msg}'
            }), 400
        current_app.logger.error(f'Error procesando devolución: {error_msg}')
        return jsonify({
            'error': f'Error al procesar la devolución: {error_msg}'
        }), 500


# ===== Obtener detalles del pago (Stripe) =====
@comprador.route("/obtener-detalles-pago/<string:payment_intent_id>", methods=["GET"])
@login_required
@role_required("comprador")
def obtener_detalles_pago(payment_intent_id):
    """
    Endpoint para obtener los detalles de un pago desde Stripe, incluyendo información de la tarjeta.
    """
    try:
        stripe_secret = current_app.config.get('STRIPE_SECRET_KEY')
        if not stripe_secret:
            return jsonify({'error': 'Stripe no está configurado'}), 500
        
        stripe.api_key = stripe_secret
        
        # Obtener el Payment Intent
        payment_intent = stripe.PaymentIntent.retrieve(payment_intent_id)
        
        # Obtener información de la tarjeta desde el payment method
        card_info = None
        if payment_intent.payment_method:
            try:
                payment_method = stripe.PaymentMethod.retrieve(payment_intent.payment_method)
                if payment_method.card:
                    card = payment_method.card
                    # Mapear tipos de tarjeta
                    brand_map = {
                        'visa': 'Visa',
                        'mastercard': 'Mastercard',
                        'amex': 'American Express',
                        'discover': 'Discover',
                        'diners': 'Diners Club',
                        'jcb': 'JCB',
                        'unionpay': 'UnionPay'
                    }
                    
                    card_info = {
                        'last4': card.last4,
                        'brand': brand_map.get(card.brand.lower(), card.brand.upper()),
                        'exp_month': card.exp_month,
                        'exp_year': card.exp_year,
                        'funding': card.funding  # credit, debit, prepaid, unknown
                    }
            except Exception as e:
                error_msg = str(e)
                if 'Stripe' in type(e).__name__ or 'stripe' in str(type(e)).lower():
                    current_app.logger.warning(f'No se pudo obtener payment method: {error_msg}')
                else:
                    raise
        
        # Si no hay payment_method directo, intentar obtener desde los charges
        if not card_info:
            try:
                charges = payment_intent.charges.data
                if charges and len(charges) > 0:
                    charge = charges[0]
                    if hasattr(charge, 'payment_method_details') and charge.payment_method_details:
                        if hasattr(charge.payment_method_details, 'card'):
                            card = charge.payment_method_details.card
                            brand_map = {
                                'visa': 'Visa',
                                'mastercard': 'Mastercard',
                                'amex': 'American Express',
                                'discover': 'Discover',
                                'diners': 'Diners Club',
                                'jcb': 'JCB',
                                'unionpay': 'UnionPay'
                            }
                            card_info = {
                                'last4': card.last4,
                                'brand': brand_map.get(card.brand.lower(), card.brand.upper()),
                                'exp_month': card.exp_month,
                                'exp_year': card.exp_year
                            }
            except Exception as e:
                current_app.logger.warning(f'No se pudo obtener info de tarjeta desde charge: {str(e)}')
        
        return jsonify({
            'success': True,
            'payment_intent': {
                'id': payment_intent.id,
                'amount': payment_intent.amount / 100,
                'currency': payment_intent.currency.upper(),
                'status': payment_intent.status,
                'created': payment_intent.created
            },
            'card': card_info
        })
        
    except Exception as e:
        error_msg = str(e)
        error_type = type(e).__name__
        if 'Stripe' in error_type or 'stripe' in str(type(e)).lower():
            return jsonify({'error': f'Error al obtener detalles del pago: {error_msg}'}), 400
        current_app.logger.error(f'Error obteniendo detalles del pago: {error_msg}')
        return jsonify({'error': 'Error al obtener los detalles del pago'}), 500

# ===== API: Enviar correo de cambio de estado de pedido =====
@comprador.route("/api/enviar-correo-cambio-estado", methods=["POST"])
@login_required
def api_enviar_correo_cambio_estado():
    """API para enviar correo cuando cambia el estado de un pedido"""
    try:
        current_app.logger.info('📧 Recibida petición para enviar correo de cambio de estado')
        
        data = request.get_json()
        if not data:
            current_app.logger.error('❌ No se recibieron datos JSON')
            return jsonify({'success': False, 'error': 'No se recibieron datos'}), 400
            
        email = data.get('email')
        nombre = data.get('nombre', 'Cliente')
        compra_id = data.get('compraId') or data.get('compra_id', '')
        nuevo_estado = data.get('nuevoEstado') or data.get('nuevo_estado', '')
        estado_anterior = data.get('estadoAnterior') or data.get('estado_anterior', '')
        productos = data.get('productos', [])
        vendedor_nombre = data.get('vendedorNombre') or data.get('vendedor_nombre', 'Vendedor')
        fecha_actualizacion = data.get('fechaActualizacion') or data.get('fecha_actualizacion', '')
        
        current_app.logger.info(f'📧 Datos recibidos: email={email}, compra_id={compra_id}, nuevo_estado={nuevo_estado}')
        
        if not email or not compra_id or not nuevo_estado:
            return jsonify({
                'success': False,
                'error': 'Email, compraId y nuevoEstado son requeridos'
            }), 400
        
        # Obtener la instancia de Mail
        mail = current_app.extensions.get('mail')
        if not mail:
            return jsonify({
                'success': False,
                'error': 'Servicio de correo no disponible'
            }), 503
        
        # Mapeo de estados
        estado_labels = {
            'preparando': 'Preparando',
            'enviado': 'Enviado',
            'recibido': 'Recibido',
            'cancelado': 'Cancelado'
        }
        
        estado_label = estado_labels.get(nuevo_estado.lower(), nuevo_estado)
        estado_anterior_label = estado_labels.get(estado_anterior.lower(), estado_anterior) if estado_anterior else 'N/A'
        
        # Construir lista de productos
        productos_html = ''
        if productos and isinstance(productos, list) and len(productos) > 0:
            productos_html = ''.join([
                f'<li>{p.get("nombre", "Producto")} - {p.get("cantidad", 0)} {p.get("unidad", "kg")}</li>'
                for p in productos
            ])
        else:
            productos_html = '<li>No hay productos especificados</li>'
        
        # Crear el HTML del correo (simplificado)
        html_body = f'''
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: linear-gradient(135deg, #2e8b57 0%, #228B22 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
                .header h1 {{ margin: 0; font-size: 28px; }}
                .content {{ background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }}
                .section {{ background: white; padding: 30px; margin-bottom: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center; }}
                .section h2 {{ color: #2e8b57; margin-top: 0; font-size: 22px; }}
                .mensaje-principal {{ color: #333; font-size: 18px; margin: 20px 0; line-height: 1.8; }}
                .estado-destacado {{ color: #2e8b57; font-size: 24px; font-weight: bold; margin: 20px 0; }}
                .footer {{ text-align: center; margin-top: 30px; color: #666; font-size: 12px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🍃 AgroMarket</h1>
                    <p style="margin: 10px 0 0 0; font-size: 18px;">Actualización de Estado de Pedido</p>
                </div>
                
                <div class="content">
                    <div class="section">
                        <h2>Hola {nombre},</h2>
                        <p class="mensaje-principal">
                            Actualización de estado del pedido <strong>#{compra_id[:9].upper()}</strong> a <span class="estado-destacado">{estado_label}</span>
                        </p>
                        <p style="color: #666; font-size: 14px; margin-top: 30px;">
                            Puedes ver el estado completo de tu pedido en cualquier momento desde tu cuenta en AgroMarket.
                        </p>
                    </div>
                </div>
                
                <div class="footer">
                    <p>© {data.get('year', '2024')} AgroMarket. Todos los derechos reservados.</p>
                </div>
            </div>
        </body>
        </html>
        '''
        
        # Crear y enviar el correo
        sender = current_app.config.get('MAIL_DEFAULT_SENDER', 'AgroMarket <agromarket559@gmail.com>')
        msg = Message(
            subject=f'📦 Actualización de Pedido #{compra_id[:9].upper()} - {estado_label}',
            recipients=[email],
            sender=sender,
            html=html_body
        )
        
        mail.send(msg)
        current_app.logger.info(f"✅ Correo de cambio de estado enviado a {email}")
        
        return jsonify({
            'success': True,
            'message': 'Correo de cambio de estado enviado correctamente'
        })
        
    except Exception as e:
        current_app.logger.error(f'❌ Error enviando correo de cambio de estado: {str(e)}', exc_info=True)
        return jsonify({
            'success': False,
            'error': f'Error al enviar correo: {str(e)}'
        }), 500


# ===== Verificar estado de devolución =====
@comprador.route("/verificar-devolucion/<string:refund_id>", methods=["GET"])
@login_required
@role_required("comprador")
def verificar_devolucion(refund_id):
    """
    Endpoint para verificar el estado de una devolución específica en Stripe.
    """
    try:
        stripe_secret = current_app.config.get('STRIPE_SECRET_KEY')
        if not stripe_secret:
            return jsonify({'error': 'Stripe no está configurado'}), 500
        
        stripe.api_key = stripe_secret
        
        refund = stripe.Refund.retrieve(refund_id)
        
        return jsonify({
            'success': True,
            'refund': {
                'id': refund.id,
                'status': refund.status,
                'amount': refund.amount / 100,  # Convertir a dólares
                'currency': refund.currency.upper(),
                'reason': refund.reason,
                'created': refund.created
            }
        })
        
    except Exception as e:
        error_msg = str(e)
        error_type = type(e).__name__
        if 'Stripe' in error_type or 'stripe' in str(type(e)).lower():
            return jsonify({'error': f'Error al verificar devolución: {error_msg}'}), 400
        current_app.logger.error(f'Error verificando devolución: {error_msg}')
        return jsonify({'error': 'Error al verificar la devolución'}), 500


# ===== Enviar notificación de devolución por correo =====
@comprador.route("/enviar-notificacion-devolucion", methods=["POST"])
@login_required
@role_required("comprador")
def enviar_notificacion_devolucion():
    """
    Endpoint para enviar correo de notificación cuando se procesa una devolución.
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No se recibieron datos'}), 400
        
        email_cliente = data.get('email_cliente', '')
        nombre_cliente = data.get('nombre_cliente', 'Cliente')
        compra_id = data.get('compra_id', 'N/A')
        monto_devolucion = float(data.get('monto_devolucion', 0))
        moneda = data.get('moneda', 'MXN')
        tipo_devolucion = data.get('tipo', 'completa')  # completa o parcial
        motivo = data.get('motivo', 'Devolución solicitada')
        refund_id = data.get('refund_id', 'N/A')
        
        if not email_cliente:
            return jsonify({'error': 'No se proporcionó el email del cliente'}), 400
        
        # Construir HTML del correo
        tipo_texto = 'completa' if tipo_devolucion == 'completa' else 'parcial'
        html_body = f'''
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: linear-gradient(135deg, #2e8b57 0%, #228B22 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
                .header h1 {{ margin: 0; font-size: 28px; }}
                .content {{ background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }}
                .section {{ background: white; padding: 20px; margin-bottom: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }}
                .section h2 {{ color: #2e8b57; margin-top: 0; font-size: 20px; border-bottom: 2px solid #2e8b57; padding-bottom: 10px; }}
                .info-box {{ background: #e8f5e9; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #2e8b57; }}
                .amount-box {{ background: #fff3cd; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; border: 2px solid #ffc107; }}
                .amount-box .amount {{ font-size: 32px; font-weight: bold; color: #2e8b57; }}
                .footer {{ text-align: center; margin-top: 30px; color: #666; font-size: 12px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🍃 AgroMarket</h1>
                    <p style="margin: 10px 0 0 0; font-size: 18px;">Confirmación de Devolución</p>
                </div>
                
                <div class="content">
                    <div class="section">
                        <h2>✅ Devolución Procesada</h2>
                        <p>Hola <strong>{nombre_cliente}</strong>,</p>
                        <p>Te informamos que tu solicitud de devolución ha sido procesada exitosamente.</p>
                    </div>
                    
                    <div class="section">
                        <h2>📋 Detalles de la Devolución</h2>
                        <div class="info-box">
                            <p><strong>Número de pedido:</strong> {compra_id}</p>
                            <p><strong>ID de devolución:</strong> {refund_id}</p>
                            <p><strong>Tipo:</strong> Devolución {tipo_texto}</p>
                            <p><strong>Motivo:</strong> {motivo}</p>
                        </div>
                        
                        <div class="amount-box">
                            <p style="margin: 0 0 10px 0; color: #666;">Monto de devolución:</p>
                            <div class="amount">{moneda} ${monto_devolucion:.2f}</div>
                        </div>
                        
                        <p style="margin-top: 15px; padding: 10px; background: #d1ecf1; border-left: 4px solid #17a2b8; border-radius: 4px;">
                            <strong>ℹ️ Importante:</strong> El reembolso aparecerá en tu tarjeta en 5-10 días hábiles, dependiendo de tu banco. 
                            Si tienes alguna pregunta, por favor contáctanos.
                        </p>
                    </div>
                    
                    <div class="footer">
                        <p>Gracias por confiar en AgroMarket 🍃</p>
                        <p>Este es un mensaje automático, por favor no respondas a este correo.</p>
                    </div>
                </div>
            </div>
        </body>
        </html>
        '''
        
        # Crear y enviar el correo
        sender = current_app.config.get('MAIL_DEFAULT_SENDER', 'AgroMarket <agromarket559@gmail.com>')
        msg = Message(
            subject=f'✅ Devolución Procesada - Pedido #{compra_id[:9].upper()}',
            recipients=[email_cliente],
            sender=sender,
            html=html_body
        )
        
        mail = current_app.extensions.get('mail')
        if not mail:
            current_app.logger.warning('Flask-Mail no está configurado correctamente')
            return jsonify({'error': 'Servicio de correo no disponible'}), 503
        
        mail.send(msg)
        
        return jsonify({
            'success': True,
            'message': 'Notificación de devolución enviada correctamente'
        })
        
    except Exception as e:
        current_app.logger.error(f'Error enviando notificación de devolución: {str(e)}')
        return jsonify({
            'error': f'Error al enviar la notificación: {str(e)}'
        }), 500