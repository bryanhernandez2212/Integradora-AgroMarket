(() => {
    const body = document.body;
    const chatMessagesEl = document.getElementById("chatMessages");
    const chatMessagesLoadingEl = document.getElementById("chatMessagesLoading");
    const chatInputEl = document.getElementById("chatInput");
    const chatSendBtn = document.getElementById("chatSendBtn");
    const chatListAvatar = document.getElementById("chatListAvatar");
    const chatListVendorName = document.getElementById("chatListVendorName");
    const chatListMeta = document.getElementById("chatListMeta");
    const chatListPreview = document.getElementById("chatListPreview");
    const chatPartnerAvatar = document.getElementById("chatPartnerAvatar");
    const chatPartnerName = document.getElementById("chatPartnerName");
    const chatOrderLabel = document.getElementById("chatOrderLabel");
    const chatOrderLink = document.getElementById("chatOrderLink");

    const dataset = body?.dataset || {};
    const chatRole = dataset.chatRole || "comprador";
    const partnerRole = dataset.partnerRole || (chatRole === "comprador" ? "vendedor" : "comprador");
    const orderLinkBase =
        dataset.orderLinkBase ||
        (chatRole === "comprador"
            ? "/comprador/detalle_pedido/"
            : "/vendedor/ventas?pedido=");

    if (!body || !chatMessagesEl || !chatInputEl || !chatSendBtn) {
        return;
    }

    let auth = null;
    let db = null;

    let currentUser = null;
    let chatDocId = null;
    let chatRef = null;
    let messagesUnsubscribe = null;
    let chatSnapshotUnsubscribe = null;

    const firebaseReady = initializeFirebase();

    firebaseReady
        .then(() => {
            if (!auth) {
                throw new Error("Firebase Auth no está disponible.");
            }
            auth.onAuthStateChanged(async (user) => {
                if (!user) {
                    window.location.href = "/auth/login";
                    return;
                }

                currentUser = user;
                await prepararChat();
                configurarEventos();
            });
        })
        .catch((error) => {
            console.error("❌ Error inicializando Firebase en chat:", error);
            mostrarError("No fue posible cargar el chat. Intenta nuevamente más tarde.");
        });

    window.addEventListener("beforeunload", () => {
        if (typeof messagesUnsubscribe === "function") {
            messagesUnsubscribe();
        }
        if (typeof chatSnapshotUnsubscribe === "function") {
            chatSnapshotUnsubscribe();
        }
    });

    async function initializeFirebase() {
        if (typeof firebase === "undefined") {
            throw new Error("Firebase SDK no está disponible en la página de chat.");
        }

        // Intentar usar la función de inicialización global si existe
        if (typeof window.inicializarFirebase === "function") {
            try {
                await window.inicializarFirebase();
            } catch (e) {
                // Si ya está inicializado, continuar
                if (!e.message || !e.message.includes('already exists')) {
                    console.warn('Error en inicializarFirebase global:', e);
                }
            }
        }

        // Verificar si Firebase ya está inicializado
        if (firebase.apps.length === 0) {
            // Si no está inicializado, inicializarlo directamente
            if (window.firebaseConfig) {
                firebase.initializeApp(window.firebaseConfig);
            } else {
                throw new Error("No se encontró la configuración de Firebase.");
            }
        }

        auth = firebase.auth();
        db = firebase.firestore();

        // Verificar que auth y db estén disponibles
        if (!auth || !db) {
            throw new Error('No se pudieron obtener auth o db de Firebase');
        }

        db.settings({
            cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED,
            ignoreUndefinedProperties: true,
        });
    }

    async function prepararChat() {
        const pedidoId = dataset.pedidoId || dataset.chatId || "pedido";

        const currentUserId = currentUser.uid;
        const currentUserName = dataset.userName || currentUser.displayName || "Usuario";

        let partnerId =
            dataset.partnerId ||
            dataset.vendedorId ||
            dataset.compradorId ||
            "";
        let partnerName =
            dataset.partnerName ||
            dataset.vendedorName ||
            dataset.compradorName ||
            (partnerRole === "vendedor" ? "Vendedor" : "Cliente");

        // Si hay un vendedor_id específico, usarlo para buscar el chat correcto
        const vendedorIdEspecifico = partnerId && chatRole === "comprador" ? partnerId : null;
        const existingChat = await buscarChatExistente(pedidoId, currentUserId, vendedorIdEspecifico);

        if (existingChat) {
            chatDocId = existingChat.id;
            chatRef = existingChat.ref;
            const data = existingChat.data;

            const dataCompradorId =
                data.comprador_id ||
                (chatRole === "comprador" ? currentUserId : partnerId);
            const dataCompradorNombre =
                data.comprador_nombre ||
                (chatRole === "comprador" ? currentUserName : partnerName);
            const dataVendedorId =
                data.vendedor_id ||
                (chatRole === "comprador" ? partnerId : currentUserId);
            const dataVendedorNombre =
                data.vendedor_nombre ||
                (chatRole === "comprador" ? partnerName : currentUserName);

            partnerId =
                chatRole === "comprador"
                    ? data.vendedor_id || partnerId
                    : data.comprador_id || partnerId;
            partnerName =
                chatRole === "comprador"
                    ? data.vendedor_nombre || partnerName
                    : data.comprador_nombre || partnerName;

            if (!partnerId || !partnerName) {
                const partner = obtenerParticipanteDesdeDatos(data, currentUserId);
                partnerId = partner.id || partnerId;
                partnerName = partner.nombre || partnerName;
            }

            dataset.partnerId = partnerId || "";
            dataset.partnerName =
                partnerName || (partnerRole === "vendedor" ? "Vendedor" : "Cliente");

            const updates = {};

            const participantsToAdd = [];

            if (!data.vendedor_id && dataVendedorId) {
                updates.vendedor_id = dataVendedorId;
            }
            if (!data.vendedor_nombre && dataVendedorNombre) {
                updates.vendedor_nombre = dataVendedorNombre;
            }
            if (!data.comprador_id && dataCompradorId) {
                updates.comprador_id = dataCompradorId;
            }
            if (!data.comprador_nombre && dataCompradorNombre) {
                updates.comprador_nombre = dataCompradorNombre;
            }
            if (!data.pedido_folio) {
                updates.pedido_folio = generarFolioPedido(pedidoId);
            }
            if (
                dataVendedorId &&
                (!Array.isArray(data.participants) ||
                    !data.participants.includes(dataVendedorId))
            ) {
                participantsToAdd.push(dataVendedorId);
            }
            if (
                dataCompradorId &&
                (!Array.isArray(data.participants) ||
                    !data.participants.includes(dataCompradorId))
            ) {
                participantsToAdd.push(dataCompradorId);
            }
            if (!data.participantsData) {
                updates.participantsData = {};
                if (dataCompradorId) {
                    updates.participantsData[dataCompradorId] = {
                        id: dataCompradorId,
                        nombre: dataCompradorNombre,
                        rol_activo: "comprador",
                    };
                }
                if (dataVendedorId) {
                    updates.participantsData[dataVendedorId] = {
                        id: dataVendedorId,
                        nombre: dataVendedorNombre,
                        rol_activo: "vendedor",
                    };
                }
            }
            if (!data.unreadCounts && dataCompradorId && dataVendedorId) {
                updates.unreadCounts = {
                    [dataCompradorId]: 0,
                    [dataVendedorId]: 0,
                };
            }
            if (participantsToAdd.length > 0) {
                updates.participants = firebase.firestore.FieldValue.arrayUnion(
                    ...participantsToAdd
                );
            }

            if (Object.keys(updates).length > 0) {
                await chatRef.set(updates, { merge: true });
                Object.assign(data, updates);
            }

            actualizarCabeceraChat(data);
        } else {
            // Si no hay chat existente, intentar obtener el partnerId de otras fuentes
            if (!partnerId) {
                console.warn('⚠️ No se encontró partnerId, intentando obtenerlo de otras fuentes...');
                
                // Intentar obtener el partnerId desde la URL o parámetros
                const urlParams = new URLSearchParams(window.location.search);
                const vendedorIdFromUrl = urlParams.get('vendedor_id') || urlParams.get('vendedorId');
                const compradorIdFromUrl = urlParams.get('comprador_id') || urlParams.get('compradorId');
                
                if (chatRole === "comprador" && vendedorIdFromUrl) {
                    partnerId = vendedorIdFromUrl;
                    console.log('✅ partnerId obtenido de URL (vendedor_id):', partnerId);
                } else if (chatRole === "vendedor" && compradorIdFromUrl) {
                    partnerId = compradorIdFromUrl;
                    console.log('✅ partnerId obtenido de URL (comprador_id):', partnerId);
                }
                
                // Si aún no hay partnerId, intentar obtenerlo desde los productos del pedido
                if (!partnerId && pedidoId && pedidoId !== "pedido") {
                    try {
                        const compraDoc = await db.collection('compras').doc(pedidoId).get();
                        if (compraDoc.exists) {
                            const compraData = compraDoc.data();
                            const productos = compraData.productos || [];
                            if (productos.length > 0 && productos[0].vendedor_id) {
                                partnerId = productos[0].vendedor_id;
                                partnerName = productos[0].vendedor_nombre || 'Vendedor';
                                console.log('✅ partnerId obtenido del pedido:', partnerId);
                            }
                        }
                    } catch (error) {
                        console.warn('⚠️ Error obteniendo partnerId del pedido:', error);
                    }
                }
            }
            
            if (!partnerId) {
                console.error('❌ No se pudo obtener partnerId de ninguna fuente');
                // En lugar de mostrar error en el área de mensajes, mostrar un mensaje más discreto
                // y redirigir o mostrar un estado vacío
                if (chatMessagesEl) {
                    chatMessagesEl.innerHTML = `
                        <div class="chat-empty-messages">
                            <i class="fas fa-info-circle"></i>
                            <p>No se pudo cargar la información del chat.</p>
                            <p style="font-size: 0.9rem; color: #999; margin-top: 0.5rem;">
                                Por favor, intenta acceder al chat desde el pedido correspondiente.
                            </p>
                        </div>
                    `;
                }
                if (chatSendBtn) chatSendBtn.disabled = true;
                return;
            }

            const compradorId = chatRole === "comprador" ? currentUserId : partnerId;
            const compradorNombre =
                chatRole === "comprador" ? currentUserName : partnerName;
            const vendedorId = chatRole === "comprador" ? partnerId : currentUserId;
            const vendedorNombre =
                chatRole === "comprador" ? partnerName : currentUserName;

            chatDocId = construirChatId(pedidoId, compradorId, vendedorId);
            chatRef = db.collection("chats").doc(chatDocId);

            const pedidoFolio = generarFolioPedido(pedidoId);

            const payload = {
                pedido_id: pedidoId,
                pedido_folio: pedidoFolio,
                metadata: {
                    orderId: pedidoId,
                },
                comprador_id: compradorId,
                comprador_nombre: compradorNombre,
                vendedor_id: vendedorId,
                vendedor_nombre: vendedorNombre,
                participants: [compradorId, vendedorId],
                participantsData: {
                    [compradorId]: {
                        id: compradorId,
                        nombre: compradorNombre,
                        rol_activo: "comprador",
                    },
                    [vendedorId]: {
                        id: vendedorId,
                        nombre: vendedorNombre,
                        rol_activo: "vendedor",
                    },
                },
                unreadCounts: {
                    [compradorId]: 0,
                    [vendedorId]: 0,
                },
                created_at: firebase.firestore.FieldValue.serverTimestamp(),
                updated_at: firebase.firestore.FieldValue.serverTimestamp(),
                last_message: "",
                last_message_at: firebase.firestore.FieldValue.serverTimestamp(),
            };

            await chatRef.set(payload, { merge: true });

            dataset.partnerId = partnerId;
            dataset.partnerName = partnerName;

            actualizarCabeceraChat(payload);
        }

        console.log('📡 Estableciendo suscripciones...');
        suscribirseAChatMetadata();
        suscribirseAMensajes();
        console.log('✅ Suscripciones establecidas');
        
        // Marcar mensajes como leídos al abrir el chat
        // Esperar un momento para que las suscripciones se establezcan
        setTimeout(async () => {
            const exito = await marcarMensajesComoLeidos();
            if (!exito) {
                // Intentar de nuevo después de 1 segundo
                setTimeout(async () => {
                    await marcarMensajesComoLeidos();
                }, 1000);
            }
        }, 300);
        
        // También marcar inmediatamente
        await marcarMensajesComoLeidos();
    }

    function construirChatId(pedidoId, compradorId, vendedorId) {
        const safePedido = (pedidoId || "pedido").replace(/[^\w\-]+/g, "-");
        const safeComprador = (compradorId || "comprador").replace(/[^\w\-]+/g, "-");
        const safeVendedor = (vendedorId || "vendedor").replace(/[^\w\-]+/g, "-");
        return `${safePedido}_${safeComprador}_${safeVendedor}`;
    }

    async function buscarChatExistente(pedidoId, userId, vendedorIdEspecifico = null) {
        if (!pedidoId) {
            return null;
        }

        try {
            const candidatosMap = new Map();

            // Si hay un vendedor_id específico, buscar directamente por pedido_id y vendedor_id
            if (vendedorIdEspecifico) {
                let snapshot = await db
                    .collection("chats")
                    .where("metadata.orderId", "==", pedidoId)
                    .where("vendedor_id", "==", vendedorIdEspecifico)
                    .limit(5)
                    .get();
                snapshot.forEach((doc) => candidatosMap.set(doc.id, doc));

                if (candidatosMap.size === 0) {
                    snapshot = await db
                        .collection("chats")
                        .where("pedido_id", "==", pedidoId)
                        .where("vendedor_id", "==", vendedorIdEspecifico)
                        .limit(5)
                        .get();
                    snapshot.forEach((doc) => candidatosMap.set(doc.id, doc));
                }
            } else {
                // Búsqueda general sin filtro de vendedor
                let snapshot = await db
                    .collection("chats")
                    .where("metadata.orderId", "==", pedidoId)
                    .limit(10)
                    .get();
                snapshot.forEach((doc) => candidatosMap.set(doc.id, doc));

                if (candidatosMap.size === 0) {
                    snapshot = await db
                        .collection("chats")
                        .where("pedido_id", "==", pedidoId)
                        .limit(10)
                        .get();
                    snapshot.forEach((doc) => candidatosMap.set(doc.id, doc));
                }
            }

            const candidatos = Array.from(candidatosMap.values());
            if (candidatos.length === 0) {
                return null;
            }

            const candidatosOrdenados = candidatos.sort((a, b) => {
                const fechaA = obtenerTimestampChat(a.data());
                const fechaB = obtenerTimestampChat(b.data());
                return fechaB - fechaA;
            });

            const candidatosConUsuario = candidatosOrdenados.filter((doc) => {
                const data = doc.data();
                if (Array.isArray(data.participants) && data.participants.includes(userId)) {
                    return true;
                }
                if (
                    data.participantsData &&
                    Object.prototype.hasOwnProperty.call(data.participantsData, userId)
                ) {
                    return true;
                }
                return (
                    data.comprador_id === userId ||
                    data.vendedor_id === userId
                );
            });

            const seleccionado = (candidatosConUsuario[0] || candidatosOrdenados[0]);

            return {
                id: seleccionado.id,
                ref: seleccionado.ref,
                data: seleccionado.data(),
            };
        } catch (error) {
            console.warn("⚠️ No se pudo recuperar un chat existente:", error);
            return null;
        }
    }

    function obtenerTimestampChat(data = {}) {
        const fecha =
            data.last_message_at ||
            data.updated_at ||
            data.updatedAt ||
            data.created_at ||
            data.createdAt ||
            null;
        if (fecha && typeof fecha.toDate === "function") {
            return fecha.toDate().getTime();
        }
        if (fecha && typeof fecha.seconds === "number") {
            return fecha.seconds * 1000;
        }
        if (typeof fecha === "string") {
            const parsed = Date.parse(fecha);
            return Number.isNaN(parsed) ? 0 : parsed;
        }
        return 0;
    }

    function suscribirseAChatMetadata() {
        if (typeof chatSnapshotUnsubscribe === "function") {
            chatSnapshotUnsubscribe();
        }

        chatSnapshotUnsubscribe = chatRef.onSnapshot(
            (snapshot) => {
                if (!snapshot.exists) {
                    return;
                }
                const data = snapshot.data();
                actualizarCabeceraChat(data);
            },
            (error) => {
                console.error("❌ Error escuchando metadatos del chat:", error);
            }
        );
    }

    function actualizarCabeceraChat(chatData = {}) {
        const pedidoId =
            (chatData.metadata && chatData.metadata.orderId) ||
            chatData.pedido_id ||
            dataset.pedidoId ||
            dataset.chatId ||
            "pedido";
        const pedidoFolio =
            chatData.pedido_folio || generarFolioPedido(pedidoId);

        const partnerName =
            chatRole === "comprador"
                ? chatData.vendedor_nombre || dataset.partnerName || "Vendedor"
                : chatData.comprador_nombre || dataset.partnerName || "Cliente";
        const partnerId =
            chatRole === "comprador"
                ? chatData.vendedor_id || dataset.partnerId || ""
                : chatData.comprador_id || dataset.partnerId || "";

        dataset.partnerName = partnerName;
        dataset.partnerId = partnerId;

        const iniciales = generarIniciales(partnerName);

        if (chatListAvatar) chatListAvatar.textContent = iniciales;
        if (chatListVendorName) chatListVendorName.textContent = partnerName;
        if (chatListMeta) chatListMeta.textContent = `Pedido #${pedidoFolio}`;
        if (chatPartnerAvatar) chatPartnerAvatar.textContent = iniciales;
        if (chatPartnerName) chatPartnerName.textContent = partnerName;
        if (chatOrderLabel) chatOrderLabel.textContent = `Pedido #${pedidoFolio}`;
        if (chatOrderLink) {
            chatOrderLink.href = `${orderLinkBase}${encodeURIComponent(pedidoId)}`;
        }

        if (chatData.last_message && chatListPreview) {
            chatListPreview.textContent = chatData.last_message;
        } else if (chatData.lastMessage && chatListPreview) {
            chatListPreview.textContent = chatData.lastMessage;
        }
    }

    function suscribirseAMensajes() {
        if (typeof messagesUnsubscribe === "function") {
            messagesUnsubscribe();
        }

        try {
            if (!chatRef) {
                console.error('❌ chatRef no está disponible para suscribirse a mensajes');
                mostrarError("Error: No se pudo establecer la conexión con el chat.");
                return;
            }
            
            const mensajesRef = chatRef.collection("messages");
            console.log('📡 Suscribiéndose a mensajes en:', mensajesRef.path);

            messagesUnsubscribe = mensajesRef.onSnapshot(
                (snapshot) => {
                    console.log('📨 Snapshot recibido, documentos:', snapshot.docs.length);
                    const mensajes = snapshot.docs.map((doc) => {
                        const data = doc.data();
                        console.log('📝 Mensaje:', { id: doc.id, text: data.message || data.text, senderId: data.senderId || data.sender_id });
                        return { id: doc.id, ...data };
                    });
                    console.log('📋 Total mensajes a renderizar:', mensajes.length);
                    renderizarMensajes(mensajes);

                    // Marcar como leído cuando se cargan los mensajes (solo si hay mensajes y es la primera carga)
                    if (chatRef && currentUser && mensajes.length > 0) {
                        // Solo marcar como leído si el chat está abierto (no en background)
                        if (document.visibilityState === 'visible') {
                            chatRef
                                .update({
                                    [`unreadCounts.${currentUser.uid}`]: 0
                                })
                                .then(() => {
                                    console.log("✅ Mensajes marcados como leídos al cargar conversación");
                                })
                                .catch((error) => {
                                    console.warn("⚠️ No se pudo actualizar unreadCounts al cargar mensajes, intentando con set:", error);
                                    // Fallback a set
                                    chatRef.set({
                                        [`unreadCounts.${currentUser.uid}`]: 0
                                    }, { merge: true }).catch(err => {
                                        console.error("❌ Error en fallback:", err);
                                    });
                                });
                            
                            // Marcar los mensajes que el usuario actual envió como "read" cuando el otro usuario abre el chat
                            const partnerId = dataset.partnerId || "";
                            if (partnerId && currentUser) {
                                const mensajesEnviadosPorMi = mensajes.filter(msg => {
                                    const msgSenderId = msg.senderId || msg.sender_id || "";
                                    // Mensajes que YO envié y que aún no están marcados como "read"
                                    return msgSenderId === currentUser.uid && msg.status !== "read";
                                });
                                
                                if (mensajesEnviadosPorMi.length > 0) {
                                    const batch = db.batch();
                                    const mensajesRef = chatRef.collection("messages");
                                    mensajesEnviadosPorMi.forEach(msg => {
                                        const msgRef = mensajesRef.doc(msg.id);
                                        batch.update(msgRef, {
                                            status: "read",
                                            readAt: firebase.firestore.FieldValue.serverTimestamp()
                                        });
                                    });
                                    
                                    batch.commit()
                                        .then(() => {
                                            console.log(`✅ ${mensajesEnviadosPorMi.length} mensajes marcados como leídos`);
                                        })
                                        .catch(error => {
                                            console.warn("⚠️ Error marcando mensajes como leídos:", error);
                                        });
                                }
                            }
                        }
                    }
                },
                (error) => {
                    console.error("❌ Error escuchando mensajes:", error);
                    mostrarError("Error al cargar los mensajes.");
                }
            );
        } catch (error) {
            console.error("❌ Error configurando suscripción de mensajes:", error);
            mostrarError("No se pudieron cargar los mensajes.");
        }
    }

    function renderizarMensajes(mensajes) {
        console.log('🎨 renderizarMensajes llamado con', mensajes.length, 'mensajes');
        console.log('chatMessagesEl:', chatMessagesEl);
        console.log('chatMessagesLoadingEl:', chatMessagesLoadingEl);
        console.log('currentUser:', currentUser);
        
        if (chatMessagesLoadingEl) {
            chatMessagesLoadingEl.style.display = "none";
        }

        if (!chatMessagesEl) {
            console.error('❌ chatMessagesEl no está disponible');
            return;
        }
        
        if (!currentUser || !currentUser.uid) {
            console.error('❌ currentUser no está disponible');
            return;
        }

        // Limpiar contenedor
        chatMessagesEl.innerHTML = "";

        if (!mensajes.length) {
            console.log('⚠️ No hay mensajes para renderizar');
            const placeholder = document.createElement("div");
            placeholder.className = "chat-empty-messages";
            placeholder.innerHTML = `
                <i class="fas fa-comments"></i>
                <p>Empieza la conversación con tu vendedor.</p>
            `;
            chatMessagesEl.appendChild(placeholder);
            if (chatListPreview) {
                chatListPreview.textContent = "Aún no hay mensajes";
            }
            actualizarCacheUltimoMensaje(chatDocId, "");
            return;
        }
        
        console.log('✅ Renderizando', mensajes.length, 'mensajes');
        console.log('Current User UID:', currentUser.uid);

        mensajes.sort((a, b) => obtenerFechaMensaje(a) - obtenerFechaMensaje(b));

        const fragment = document.createDocumentFragment();
        let ultimoDia = "";

        mensajes.forEach((mensaje) => {
            const fecha = obtenerFechaMensaje(mensaje);
            const diaEtiqueta = formatearFechaDia(fecha);

            if (diaEtiqueta !== ultimoDia) {
                const separator = document.createElement("div");
                separator.className = "chat-day-separator";
                separator.textContent = diaEtiqueta;
                fragment.appendChild(separator);
                ultimoDia = diaEtiqueta;
            }

            const senderIdMensaje =
                mensaje.sender_id ||
                mensaje.senderId ||
                mensaje.user_id ||
                mensaje.userId ||
                "";
            
            // Verificar que currentUser esté disponible
            if (!currentUser || !currentUser.uid) {
                console.error('❌ currentUser no está disponible al renderizar mensajes');
                return;
            }
            
            const esPropio = senderIdMensaje === currentUser.uid;
            console.log('👤 Mensaje:', {
                senderId: senderIdMensaje,
                currentUserId: currentUser.uid,
                esPropio: esPropio,
                texto: mensaje.message || mensaje.text || mensaje.texto,
                comparacion: `${senderIdMensaje} === ${currentUser.uid} = ${esPropio}`
            });
            
            // Si no se puede determinar, asumir que no es propio
            if (!senderIdMensaje) {
                console.warn('⚠️ Mensaje sin senderId, asumiendo que no es propio');
            }
            const messageEl = document.createElement("div");
            messageEl.className = `chat-message ${esPropio ? "enviado" : "recibido"}`;

            const bubbleEl = document.createElement("div");
            bubbleEl.className = "chat-message-bubble";

            const textEl = document.createElement("p");
            textEl.textContent =
                mensaje.message ||
                mensaje.texto ||
                mensaje.text ||
                mensaje.body ||
                mensaje.content ||
                mensaje.mensaje ||
                "";

            const timeEl = document.createElement("span");
            timeEl.className = "chat-message-time";
            const timeText = fecha
                ? fecha.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
                : "";
            timeEl.textContent = timeText;

            // Agregar checkmarks de estado solo para mensajes propios
            if (esPropio) {
                const statusEl = document.createElement("span");
                statusEl.className = "chat-message-status";
                const status = mensaje.status || "sent";
                
                if (status === "read") {
                    statusEl.innerHTML = '<i class="fas fa-check-double" style="color: #4a90e2;"></i>';
                    statusEl.title = "Leído";
                } else if (status === "delivered") {
                    statusEl.innerHTML = '<i class="fas fa-check-double"></i>';
                    statusEl.title = "Entregado";
                } else {
                    statusEl.innerHTML = '<i class="fas fa-check"></i>';
                    statusEl.title = "Enviado";
                }
                
                timeEl.appendChild(statusEl);
            }

            bubbleEl.appendChild(textEl);
            bubbleEl.appendChild(timeEl);

            messageEl.appendChild(bubbleEl);
            fragment.appendChild(messageEl);
        });

        chatMessagesEl.appendChild(fragment);
        
        // Forzar scroll al final después de renderizar - múltiples intentos para asegurar que funcione
        const scrollToBottom = () => {
            if (chatMessagesEl) {
                const previousScroll = chatMessagesEl.scrollTop;
                chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
                console.log('📜 Scroll:', {
                    anterior: previousScroll,
                    nuevo: chatMessagesEl.scrollTop,
                    alturaTotal: chatMessagesEl.scrollHeight,
                    alturaVisible: chatMessagesEl.clientHeight
                });
                
                // Si el scroll no cambió, intentar con requestAnimationFrame
                if (chatMessagesEl.scrollTop === previousScroll && chatMessagesEl.scrollHeight > chatMessagesEl.clientHeight) {
                    requestAnimationFrame(() => {
                        chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
                    });
                }
            }
        };
        
        // Scroll inmediato
        scrollToBottom();
        
        // Scroll después de un pequeño delay
        setTimeout(scrollToBottom, 50);
        setTimeout(scrollToBottom, 200);
        setTimeout(scrollToBottom, 500);

        const ultimoMensaje = mensajes[mensajes.length - 1] || {};
        const textoUltimoMensaje =
            ultimoMensaje.message ||
            ultimoMensaje.texto ||
            ultimoMensaje.text ||
            ultimoMensaje.body ||
            ultimoMensaje.content ||
            ultimoMensaje.mensaje ||
            "";
        if (chatListPreview && textoUltimoMensaje) {
            chatListPreview.textContent = textoUltimoMensaje;
        }
        actualizarCacheUltimoMensaje(chatDocId, textoUltimoMensaje);
        
        console.log('✅ Mensajes renderizados correctamente');
    }

    function obtenerFechaMensaje(mensaje) {
        const fecha =
            mensaje.created_at ||
            mensaje.createdAt ||
            mensaje.fecha ||
            mensaje.timestamp ||
            mensaje.time ||
            null;
        if (!fecha) {
            return new Date(0);
        }
        if (typeof fecha.toDate === "function") {
            return fecha.toDate();
        }
        if (fecha.seconds) {
            return new Date(fecha.seconds * 1000);
        }
        if (typeof fecha === "string") {
            const parsed = Date.parse(fecha);
            return Number.isNaN(parsed) ? new Date(0) : new Date(parsed);
        }
        if (typeof fecha === "number") {
            return new Date(fecha);
        }
        return new Date(0);
    }

    function formatearFechaDia(fecha) {
        if (!fecha) {
            return "";
        }
        const hoy = new Date();
        if (
            fecha.getFullYear() === hoy.getFullYear() &&
            fecha.getMonth() === hoy.getMonth() &&
            fecha.getDate() === hoy.getDate()
        ) {
            return "Hoy";
        }
        return fecha.toLocaleDateString("es-MX", {
            year: "numeric",
            month: "long",
            day: "numeric",
        });
    }

    function configurarEventos() {
        console.log('🔧 Configurando eventos del chat...');
        console.log('chatSendBtn:', chatSendBtn);
        console.log('chatInputEl:', chatInputEl);
        
        if (!chatSendBtn || !chatInputEl) {
            console.error('❌ No se encontraron los elementos del chat');
            return;
        }
        
        // Remover listeners anteriores si existen
        const newSendBtn = chatSendBtn.cloneNode(true);
        chatSendBtn.parentNode.replaceChild(newSendBtn, chatSendBtn);
        const newInputEl = chatInputEl.cloneNode(true);
        chatInputEl.parentNode.replaceChild(newInputEl, chatInputEl);
        
        // Actualizar referencias
        const actualSendBtn = document.getElementById("chatSendBtn");
        const actualInputEl = document.getElementById("chatInput");
        
        if (actualSendBtn && actualInputEl) {
            actualSendBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('📤 Botón enviar clickeado');
                enviarMensaje();
            });
            
            actualInputEl.addEventListener("keydown", (event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.stopPropagation();
                    console.log('📤 Enter presionado');
                    enviarMensaje();
                }
            });
            
            console.log('✅ Eventos configurados correctamente');
        } else {
            console.error('❌ No se pudieron obtener los elementos actualizados');
        }
    }

    async function enviarMensaje() {
        console.log('📨 enviarMensaje llamado');
        
        // Obtener elementos actualizados
        const actualInputEl = document.getElementById("chatInput");
        const actualSendBtn = document.getElementById("chatSendBtn");
        
        if (!actualInputEl || !actualSendBtn) {
            console.error('❌ No se encontraron los elementos del input o botón');
            return;
        }
        
        const texto = (actualInputEl.value || "").trim();
        console.log('📝 Texto a enviar:', texto);
        console.log('chatRef:', chatRef);
        console.log('currentUser:', currentUser);
        
        if (!texto || !chatRef || !currentUser) {
            console.warn('⚠️ No se puede enviar: texto vacío o falta chatRef/currentUser');
            return;
        }

        actualSendBtn.disabled = true;

        try {
            const mensajesRef = chatRef.collection("messages");
            const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp();
            const senderName = currentUser.displayName || body.dataset.userName || "Usuario";

            const messageData = {
                chatId: chatDocId,
                text: texto,
                message: texto,
                type: "text",
                senderId: currentUser.uid,
                sender_id: currentUser.uid, // Agregar también sender_id para compatibilidad
                senderName: senderName,
                status: "sent", // Estados: "sent", "delivered", "read"
                createdAt: serverTimestamp,
                updatedAt: serverTimestamp,
                created_at: serverTimestamp,
                updated_at: serverTimestamp,
                readBy: [currentUser.uid],
            };
            
            console.log('💾 Datos del mensaje a guardar:', {
                senderId: messageData.senderId,
                sender_id: messageData.sender_id,
                currentUserUid: currentUser.uid,
                texto: texto
            });

            if (body.dataset.userEmail) {
                messageData.senderEmail = body.dataset.userEmail;
            }

            console.log('💾 Guardando mensaje en Firestore...');
            const messageRef = await mensajesRef.add(messageData);
            console.log('✅ Mensaje guardado con ID:', messageRef.id);
            console.log('📋 Datos del mensaje:', messageData);
            
            // Marcar como entregado después de un momento (el mensaje está en Firestore)
            setTimeout(async () => {
                try {
                    await messageRef.update({
                        status: "delivered",
                        deliveredAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    console.log('✅ Mensaje marcado como entregado');
                } catch (error) {
                    console.warn("⚠️ No se pudo marcar mensaje como entregado:", error);
                }
            }, 500);

            const partnerId = dataset.partnerId || "";
            const partnerName = dataset.partnerName || "";
            const currentUserName =
                currentUser.displayName || dataset.userName || "Usuario";

            const timestamp = firebase.firestore.FieldValue.serverTimestamp();

            await db.runTransaction(async (transaction) => {
                const snapshot = await transaction.get(chatRef);
                const previousData = snapshot.exists ? snapshot.data() || {} : {};

                const updates = {
                    updated_at: timestamp,
                    updatedAt: timestamp,
                    lastMessage: texto,
                    last_message: texto, // Agregar también last_message para compatibilidad
                    lastMessageAt: timestamp,
                    last_message_at: timestamp, // Agregar también last_message_at para compatibilidad
                    lastMessageSenderId: currentUser.uid,
                    lastMessageSenderName: currentUserName,
                    lastMessageSenderRole: chatRole,
                    lastSenderId: currentUser.uid,
                    lastSenderName: currentUserName,
                    lastSenderRole: chatRole,
                    [`unreadCounts.${currentUser.uid}`]: 0,
                    [`participantsData.${currentUser.uid}`]: {
                        id: currentUser.uid,
                        nombre: currentUserName,
                        rol_activo: chatRole,
                    },
                };

                if (partnerId) {
                    updates[`unreadCounts.${partnerId}`] =
                        firebase.firestore.FieldValue.increment(1);
                    updates[`participantsData.${partnerId}`] = {
                        id: partnerId,
                        nombre: partnerName,
                        rol_activo: partnerRole,
                    };
                }

                if (previousData && typeof previousData === "object") {
                    if (Object.prototype.hasOwnProperty.call(previousData, "last_message")) {
                        updates.last_message = previousData.last_message;
                    }
                    if (Object.prototype.hasOwnProperty.call(previousData, "last_message_at")) {
                        updates.last_message_at = previousData.last_message_at;
                    }
                    if (
                        Object.prototype.hasOwnProperty.call(
                            previousData,
                            "last_message_sender_id"
                        )
                    ) {
                        updates.last_message_sender_id = previousData.last_message_sender_id;
                    }
                    if (
                        Object.prototype.hasOwnProperty.call(
                            previousData,
                            "last_message_sender_name"
                        )
                    ) {
                        updates.last_message_sender_name = previousData.last_message_sender_name;
                    }
                    if (
                        Object.prototype.hasOwnProperty.call(
                            previousData,
                            "last_message_sender_role"
                        )
                    ) {
                        updates.last_message_sender_role = previousData.last_message_sender_role;
                    }
                    if (
                        Object.prototype.hasOwnProperty.call(previousData, "last_sender_id")
                    ) {
                        updates.last_sender_id = previousData.last_sender_id;
                    }
                    if (
                        Object.prototype.hasOwnProperty.call(previousData, "last_sender_name")
                    ) {
                        updates.last_sender_name = previousData.last_sender_name;
                    }
                    if (
                        Object.prototype.hasOwnProperty.call(previousData, "last_sender_role")
                    ) {
                        updates.last_sender_role = previousData.last_sender_role;
                    }
                }

                transaction.set(chatRef, updates, { merge: true });
            });

            actualInputEl.value = "";
            actualInputEl.focus();
            console.log('✅ Mensaje enviado correctamente');
            
            // Notificar a la lista de chats que se actualizó el último mensaje
            actualizarCacheUltimoMensaje(chatDocId, texto);
            
            // Forzar scroll al final después de enviar
            setTimeout(() => {
                const messagesContainer = document.getElementById("chatMessages");
                if (messagesContainer) {
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                    console.log('📜 Scroll forzado después de enviar');
                }
            }, 200);
        } catch (error) {
            console.error("❌ Error enviando mensaje:", error);
            alert("No se pudo enviar tu mensaje. Inténtalo nuevamente.");
        } finally {
            actualSendBtn.disabled = false;
        }
    }

    function generarIniciales(nombre) {
        if (!nombre) {
            return "AG";
        }
        return nombre
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map((parte) => parte.charAt(0).toUpperCase())
            .join("") || "AG";
    }

    function obtenerParticipanteDesdeDatos(chatData, currentUserId) {
        if (chatData.participantsData) {
            for (const [id, datos] of Object.entries(chatData.participantsData)) {
                if (id !== currentUserId) {
                    return {
                        id,
                        nombre:
                            datos.nombre ||
                            datos.nombre_tienda ||
                            datos.email?.split("@")[0] ||
                            "",
                    };
                }
            }
        }

        if (chatData.comprador_id && chatData.comprador_id !== currentUserId) {
            return {
                id: chatData.comprador_id,
                nombre: chatData.comprador_nombre || "",
            };
        }
        if (chatData.vendedor_id && chatData.vendedor_id !== currentUserId) {
            return {
                id: chatData.vendedor_id,
                nombre: chatData.vendedor_nombre || "",
            };
        }

        const participantes = Array.isArray(chatData.participants)
            ? chatData.participants
            : [];
        const otherId = participantes.find((id) => id !== currentUserId) || "";

        return {
            id: otherId,
            nombre: chatData[`perfil_${otherId}`] || "",
        };
    }

    function generarFolioPedido(pedidoId) {
        const base = (pedidoId || "PEDIDO").toString().toUpperCase();
        const clean = base.replace(/[^\w]/g, "").substring(0, 8);
        return `PED-${clean}`;
    }

    function mostrarError(mensaje) {
        console.error('❌ Error en chat:', mensaje);
        // No mostrar errores en el área de mensajes, solo loguearlos
        // Los errores se manejan de manera más discreta
        if (chatMessagesEl) {
            // Solo mostrar un estado vacío si no hay mensajes
            if (chatMessagesEl.children.length === 0 || 
                (chatMessagesEl.children.length === 1 && chatMessagesEl.querySelector('.chat-loading'))) {
                chatMessagesEl.innerHTML = `
                    <div class="chat-empty-messages">
                        <i class="fas fa-comments"></i>
                        <p>No hay mensajes disponibles.</p>
                    </div>
                `;
            }
        }
    }

    function actualizarCacheUltimoMensaje(chatId, texto) {
        if (!chatId) return;
        try {
            const event = new CustomEvent("chat-last-message-update", {
                detail: {
                    chatId,
                    texto: (texto || "").toString().trim(),
                },
            });
            window.dispatchEvent(event);
        } catch (error) {
            console.warn("No se pudo notificar el último mensaje", error);
        }
    }

    async function marcarMensajesComoLeidos() {
        if (!chatRef || !currentUser) {
            console.warn("⚠️ No se pueden marcar mensajes como leídos: chatRef o currentUser no disponible");
            return false;
        }

        try {
            const userId = currentUser.uid;
            const chatId = chatRef.id;
            console.log(`📖 Marcando mensajes como leídos para usuario ${userId} en chat ${chatId}`);
            
            // Obtener el documento actual para verificar el estado
            const chatDoc = await chatRef.get();
            if (!chatDoc.exists) {
                console.warn("⚠️ El chat no existe en Firestore");
                return false;
            }
            
            const currentData = chatDoc.data();
            const currentUnread = currentData.unreadCounts?.[userId] || 0;
            console.log(`📊 Contador actual antes de marcar como leído: ${currentUnread}`);
            
            // Actualizar el contador de mensajes no leídos a 0 usando update en lugar de set
            await chatRef.update({
                [`unreadCounts.${userId}`]: 0
            });
            
            console.log(`✅ Actualización enviada: unreadCounts.${userId} = 0`);
            
            // Verificar que se actualizó correctamente después de un momento
            await new Promise(resolve => setTimeout(resolve, 200));
            const updatedDoc = await chatRef.get();
            if (updatedDoc.exists) {
                const updatedData = updatedDoc.data();
                const updatedUnread = updatedData.unreadCounts?.[userId] || 0;
                console.log(`✅ Verificado: contador después de actualizar = ${updatedUnread}`);
                
                if (updatedUnread === 0) {
                    console.log(`✅✅ Mensajes marcados como leídos correctamente`);
                    return true;
                } else {
                    console.warn(`⚠️ El contador no se actualizó correctamente. Sigue siendo ${updatedUnread}`);
                    // Intentar de nuevo con set
                    await chatRef.set({
                        [`unreadCounts.${userId}`]: 0
                    }, { merge: true });
                    return false;
                }
            }
            
            return true;
        } catch (error) {
            console.error("❌ Error marcando mensajes como leídos:", error);
            console.error("Stack:", error.stack);
            
            // Intentar con set como fallback
            try {
                await chatRef.set({
                    [`unreadCounts.${currentUser.uid}`]: 0
                }, { merge: true });
                console.log("✅ Fallback: usado set en lugar de update");
            } catch (fallbackError) {
                console.error("❌ Error en fallback:", fallbackError);
            }
            
            return false;
        }
    }
})();

