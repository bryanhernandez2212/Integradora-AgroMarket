(() => {
    const body = document.body;
    const chatListEl = document.getElementById("chatList");
    const emptyStateEl = document.getElementById("chatEmptyState");
    const loadingEl = document.getElementById("chatLoading");

    if (!chatListEl || !body) {
        return;
    }

    const chatBaseUrl = body.dataset.chatBaseUrl || "/comprador/chats/";
    const partnerNameParam = body.dataset.partnerNameParam || "vendedor";
    const partnerIdParam = body.dataset.partnerIdParam || "vendedor_id";
    const defaultEmptyMessage =
        body.dataset.emptyMessage || "No tienes conversaciones aún.";
    const defaultPreview = "No hay mensajes todavía.";

    let auth = null;
    let db = null;
    let currentUserId = null;
    let currentUserRole = null; // Almacenar el rol activo del usuario
    let unsubscribeHandlers = [];
    const chatsMap = new Map();
    const lastMessageCache = new Map();

    window.addEventListener("chat-last-message-update", (event) => {
        const { chatId, texto } = event.detail || {};
        if (!chatId) return;
        lastMessageCache.set(chatId, texto || "");
        const enlace = chatListEl.querySelector(`[data-chat-id="${chatId}"]`);
        if (enlace) {
            const previewEl = enlace.querySelector(".chat-preview");
            if (previewEl && texto) {
                previewEl.textContent = texto;
            }
            // Actualizar también la fecha a "Hace un momento"
            const timeEl = enlace.querySelector(".chat-time");
            if (timeEl) {
                timeEl.textContent = "Hace un momento";
            }
            // Mover el chat al principio de la lista (reordenar)
            if (currentUserId) {
                const chats = Array.from(chatsMap.values());
                const chatActualizado = chats.find(c => c.id === chatId);
                if (chatActualizado) {
                    // Actualizar la fecha del chat en el mapa
                    chatActualizado.last_message = texto;
                    chatActualizado.lastMessage = texto;
                    const ahora = Date.now();
                    chatActualizado.last_message_at = { seconds: Math.floor(ahora / 1000), nanoseconds: 0 };
                    chatActualizado.lastMessageAt = { seconds: Math.floor(ahora / 1000), nanoseconds: 0 };
                    chatActualizado.updated_at = { seconds: Math.floor(ahora / 1000), nanoseconds: 0 };
                    chatActualizado.updatedAt = { seconds: Math.floor(ahora / 1000), nanoseconds: 0 };
                    
                    chats.sort((a, b) => {
                        // El chat actualizado va primero
                        if (a.id === chatId) return -1;
                        if (b.id === chatId) return 1;
                        const fechaA = obtenerFecha(a);
                        const fechaB = obtenerFecha(b);
                        return fechaB - fechaA;
                    });
                    renderChats(currentUserId, chats);
                }
            }
        }
    });

    const firebaseReady = initializeFirebase();

    firebaseReady
        .then(() => {
            if (!auth) {
                throw new Error("Firebase Auth no está disponible.");
            }
            auth.onAuthStateChanged((user) => {
                if (!user) {
                    limpiarSuscripciones();
                    mostrarEmptyState("Debes iniciar sesión para ver tus chats.");
                    currentUserId = null;
                    return;
                }
                currentUserId = user.uid;
                suscribirseAChats(user.uid);
            });
        })
        .catch((error) => {
            console.error("❌ Error inicializando Firebase en chats:", error);
            mostrarEmptyState("No fue posible cargar tus chats en este momento.");
        });

    // Función para ocultar conversación y mostrar placeholder
    function ocultarConversacion() {
        const placeholder = document.getElementById('chatPlaceholder');
        const conversation = document.getElementById('chatConversation');
        
        if (placeholder && conversation) {
            conversation.style.display = 'none';
            placeholder.style.display = 'flex';
            
            // Remover clase para mostrar lista en móvil
            conversation.classList.remove('chat-conversation-active');
            const chatLayout = conversation.closest('.chat-layout');
            if (chatLayout) {
                chatLayout.classList.remove('has-active-conversation');
            }
            
            // Ocultar botón volver móvil
            const chatBackBtnMobile = document.getElementById('chatBackBtnMobile');
            if (chatBackBtnMobile) {
                chatBackBtnMobile.style.display = 'none';
            }
            
            // Remover clase active de todos los chats
            const chatItems = chatListEl.querySelectorAll('.chat-item');
            chatItems.forEach(item => item.classList.remove('active'));
        }
    }

    // Configurar botón volver para ocultar conversación en pantalla grande
    const chatBackBtn = document.getElementById('chatBackBtn');
    if (chatBackBtn) {
        chatBackBtn.addEventListener('click', (e) => {
            const isLargeScreen = window.innerWidth > 992;
            if (isLargeScreen) {
                e.preventDefault();
                ocultarConversacion();
            }
            // En pantalla pequeña, dejar que el enlace navegue normalmente
        });
    }

    window.addEventListener("beforeunload", () => {
        limpiarSuscripciones();
    });

    async function initializeFirebase() {
        if (typeof firebase === "undefined") {
            throw new Error("Firebase SDK no está disponible en la página de chats.");
        }

        if (firebase.apps.length === 0) {
            if (!window.firebaseConfig) {
                throw new Error("No se encontró la configuración de Firebase.");
            }
            firebase.initializeApp(window.firebaseConfig);
        }

        auth = firebase.auth();
        db = firebase.firestore();

        db.settings({
            cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED,
            ignoreUndefinedProperties: true,
        });
    }

    function limpiarSuscripciones() {
        if (Array.isArray(unsubscribeHandlers)) {
            unsubscribeHandlers.forEach((fn) => {
                if (typeof fn === "function") {
                    fn();
                }
            });
        }
        unsubscribeHandlers = [];
        chatsMap.clear();
        lastMessageCache.clear();
    }

    async function suscribirseAChats(uid) {
        limpiarSuscripciones();
        mostrarLoading(true);

        try {
            // Obtener el rol activo del usuario desde Firestore
            let rolActivo = null;
            try {
                const userDoc = await db.collection("usuarios").doc(uid).get();
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    rolActivo = userData.rol_activo ? String(userData.rol_activo).toLowerCase().trim() : null;
                    console.log('🎭 Rol activo del usuario:', rolActivo);
                }
            } catch (error) {
                console.warn('⚠️ No se pudo obtener el rol activo del usuario:', error);
            }
            
            // Si no se encontró el rol activo, intentar obtenerlo del atributo data-chat-role del body
            if (!rolActivo) {
                const chatRole = body?.dataset?.chatRole;
                if (chatRole) {
                    rolActivo = String(chatRole).toLowerCase().trim();
                    console.log('🎭 Rol activo obtenido del atributo data-chat-role:', rolActivo);
                }
            }
            
            // Guardar el rol activo para usarlo en el filtrado
            currentUserRole = rolActivo;

            const chatsRef = db.collection("chats");
            const queries = [];

            // Filtrar chats según el rol activo
            if (rolActivo === "comprador") {
                // Si el rol activo es comprador, solo mostrar chats donde es comprador
                queries.push(chatsRef.where("comprador_id", "==", uid));
                console.log('📋 Filtrando chats como COMPRADOR');
            } else if (rolActivo === "vendedor") {
                // Si el rol activo es vendedor, solo mostrar chats donde es vendedor
                queries.push(chatsRef.where("vendedor_id", "==", uid));
                console.log('📋 Filtrando chats como VENDEDOR');
            } else {
                // Si no hay rol activo definido, usar el comportamiento anterior (mostrar todos)
                console.warn('⚠️ No se encontró rol activo, mostrando todos los chats del usuario');
                queries.push(
                    chatsRef.where("comprador_id", "==", uid),
                    chatsRef.where("vendedor_id", "==", uid)
                );
            }

            queries.forEach((query) => agregarSuscripcion(query, uid));
        } catch (error) {
            console.error("❌ Error configurando suscripción a chats:", error);
            mostrarEmptyState("No fue posible cargar tus chats.");
        }
    }

    function agregarSuscripcion(query, uid) {
        const unsubscribe = query.onSnapshot(
            (snapshot) => {
                let hayCambios = false;
                
                snapshot.docChanges().forEach((change) => {
                    const data = {
                        id: change.doc.id,
                        ...change.doc.data(),
                    };

                    if (change.type === "removed") {
                        chatsMap.delete(change.doc.id);
                        lastMessageCache.delete(change.doc.id);
                        hayCambios = true;
                        return;
                    }
                    
                    // Filtrar chats según el rol activo del usuario
                    if (currentUserRole) {
                        const isComprador = currentUserRole === "comprador";
                        const isVendedor = currentUserRole === "vendedor";
                        
                        if (isComprador && data.comprador_id !== uid) {
                            // Si el rol activo es comprador pero este chat no es del comprador, ignorarlo
                            console.log('🚫 Chat ignorado (no es del comprador):', change.doc.id);
                            return;
                        }
                        
                        if (isVendedor && data.vendedor_id !== uid) {
                            // Si el rol activo es vendedor pero este chat no es del vendedor, ignorarlo
                            console.log('🚫 Chat ignorado (no es del vendedor):', change.doc.id);
                            return;
                        }
                    }

                    const chatAnterior = chatsMap.get(change.doc.id);
                    const unreadAnterior = chatAnterior?.unreadCounts?.[uid] || 0;
                    const unreadNuevo = data.unreadCounts?.[uid] || 0;
                    
                    // Verificar si cambió el último mensaje
                    const previewAnterior = obtenerPreview(chatAnterior || {});
                    const previewNuevo = obtenerPreview(data);
                    const lastMessageAnterior = chatAnterior?.last_message || chatAnterior?.lastMessage || "";
                    const lastMessageNuevo = data.last_message || data.lastMessage || "";
                    const lastMessageAtAnterior = obtenerFecha(chatAnterior || {});
                    const lastMessageAtNuevo = obtenerFecha(data);

                    // Si cambió el contador de mensajes no leídos, marcar como cambio importante
                    if (unreadAnterior !== unreadNuevo) {
                        console.log(`📬 Chat ${change.doc.id}: Contador cambió de ${unreadAnterior} a ${unreadNuevo}`);
                        hayCambios = true;
                    }
                    
                    // Si cambió el último mensaje o la fecha, marcar como cambio importante
                    if (lastMessageAnterior !== lastMessageNuevo || lastMessageAtAnterior !== lastMessageAtNuevo) {
                        console.log(`💬 Chat ${change.doc.id}: Último mensaje cambió de "${lastMessageAnterior}" a "${lastMessageNuevo}"`);
                        hayCambios = true;
                    }

                    // Siempre actualizar el mapa para tener los datos más recientes
                    chatsMap.set(change.doc.id, data);
                    
                    // Si el contador cambió a 0, forzar actualización
                    if (unreadAnterior > 0 && unreadNuevo === 0) {
                        console.log(`✅ Chat ${change.doc.id} marcado como leído - actualizando lista`);
                        hayCambios = true;
                    }

                    // Actualizar el preview del último mensaje
                    const preview = previewNuevo || previewAnterior;
                    if (preview && preview !== defaultPreview) {
                        lastMessageCache.set(change.doc.id, preview);
                        // Actualizar el preview en el DOM si el elemento existe
                        const enlace = chatListEl.querySelector(`[data-chat-id="${change.doc.id}"]`);
                        if (enlace) {
                            const previewEl = enlace.querySelector(".chat-preview");
                            if (previewEl) {
                                previewEl.textContent = preview;
                            }
                            // Actualizar también la fecha
                            const timeEl = enlace.querySelector(".chat-time");
                            if (timeEl && lastMessageAtNuevo) {
                                timeEl.textContent = formatearFechaRelativa(lastMessageAtNuevo);
                            }
                        }
                    } else if (change.doc.id) {
                        actualizarPreviewDesdeMensajes(change.doc.id);
                    }
                });

                // Renderizar siempre para asegurar que se actualicen los indicadores
                const chats = Array.from(chatsMap.values());
                chats.sort((a, b) => {
                    const fechaA = obtenerFecha(a);
                    const fechaB = obtenerFecha(b);
                    return fechaB - fechaA;
                });

                try {
                    renderChats(uid, chats);
                } catch (error) {
                    console.error("❌ Error renderizando chats:", error);
                    mostrarLoading(false);
                    mostrarEmptyState("Error al mostrar los chats. Por favor, recarga la página.");
                }
            },
            (error) => {
                console.error("❌ Error escuchando chats:", error);
                mostrarLoading(false);
                mostrarEmptyState("Ocurrió un error al cargar tus chats.");
            }
        );

        unsubscribeHandlers.push(unsubscribe);
    }

    function actualizarPreviewDesdeMensajes(chatId) {
        if (!db || !chatId) {
            return;
        }

        db.collection("chats")
            .doc(chatId)
            .collection("messages")
            .orderBy("created_at", "desc")
            .limit(1)
            .get()
            .then((snapshot) => {
                const mensaje = snapshot.docs[0]?.data() || {};
                const texto =
                    (mensaje.message ||
                        mensaje.texto ||
                        mensaje.text ||
                        mensaje.body ||
                        mensaje.content ||
                        "")
                        .toString()
                        .trim();
                if (texto) {
                    lastMessageCache.set(chatId, texto);
                }
            })
            .catch((error) => {
                console.warn("No se pudo actualizar el preview desde mensajes", chatId, error);
            });
    }

    function obtenerFecha(chat) {
        const fecha =
            chat.last_message_at ||
            chat.lastMessageAt ||
            chat.updated_at ||
            chat.updatedAt ||
            chat.created_at ||
            chat.createdAt ||
            null;
        if (fecha && typeof fecha.toDate === "function") {
            return fecha.toDate().getTime();
        }
        if (fecha && typeof fecha.seconds === "number") {
            return fecha.seconds * 1000;
        }
        if (typeof fecha === "string") {
            return new Date(fecha).getTime();
        }
        if (typeof fecha === "number") {
            return fecha;
        }
        return 0;
    }

    function renderChats(currentUserId, chats) {
        chatListEl.innerHTML = "";

        if (!chats.length) {
            mostrarEmptyState();
            return;
        }

        mostrarEmptyState(false);

        const fragment = document.createDocumentFragment();

        chats.forEach((chat) => {
            try {
                const partner = obtenerOtroParticipante(chat, currentUserId);
                
                // Validar que partner existe y tiene datos válidos
                if (!partner || !partner.nombre) {
                    console.warn(`⚠️ Chat ${chat.id} no tiene partner válido, saltando...`);
                    return;
                }
                
                const nombre = partner.nombre || "Contacto";
                const iniciales = generarIniciales(nombre);
                const pedidoId = obtenerPedidoId(chat);
                const pedidoEtiqueta = obtenerEtiquetaPedido(chat, pedidoId);
                const partnerId = partner.id || "";
                let previewText = obtenerPreview(chat);
                const fecha = obtenerFecha(chat);

            const enlace = document.createElement("a");
            enlace.className = "chat-item";
            enlace.href = crearEnlaceConversacion(pedidoId, nombre, partnerId);
            enlace.dataset.chatId = chat.id || "";

            const avatar = document.createElement("div");
            avatar.className = "chat-avatar";
            avatar.textContent = iniciales;

            const info = document.createElement("div");
            info.className = "chat-info";

            const header = document.createElement("div");
            header.className = "chat-info-header";

            const titulo = document.createElement("h3");
            titulo.textContent = nombre;

            const time = document.createElement("span");
            time.className = "chat-time";
            time.textContent = fecha ? formatearFechaRelativa(fecha) : "Sin fecha";

            header.appendChild(titulo);
            header.appendChild(time);

            const previewEl = document.createElement("p");
            previewEl.className = "chat-preview";

            if (chat.id && lastMessageCache.has(chat.id)) {
                previewText = lastMessageCache.get(chat.id) || previewText;
            } else if (!previewText || previewText === defaultPreview) {
                previewText = defaultPreview;
                if (chat.id) {
                    completarPreviewDesdeMensajes(chat.id, previewEl);
                }
            }

            previewEl.textContent = previewText;

            info.appendChild(header);
            info.appendChild(previewEl);

            const tieneNuevosMensajes = partner.unread > 0;

            if (tieneNuevosMensajes) {
                enlace.classList.add("chat-item-unread");

                // Badge con número de mensajes no leídos
                const badge = document.createElement("span");
                badge.className = "chat-unread-badge";
                badge.textContent = partner.unread > 99 ? "99+" : partner.unread.toString();
                badge.setAttribute("aria-label", `${partner.unread} mensaje${partner.unread > 1 ? 's' : ''} no leído${partner.unread > 1 ? 's' : ''}`);
                header.appendChild(badge);

                console.log(`🔔 Chat ${chat.id} tiene ${partner.unread} mensajes no leídos`);
            } else {
                // Remover clases y elementos si no hay mensajes no leídos
                if (enlace.classList.contains("chat-item-unread")) {
                    enlace.classList.remove("chat-item-unread");
                    // Remover badge si existe
                    const existingBadge = header.querySelector(".chat-unread-badge");
                    if (existingBadge) {
                        existingBadge.remove();
                    }
                }
            }

            enlace.appendChild(avatar);
            enlace.appendChild(info);

            // NO interceptar clic - siempre navegar a la página de conversación
            // El usuario no quiere el panel de conversación en la lista de chats
            // enlace.addEventListener('click', (e) => {
            //     // Siempre navegar a la página de conversación individual
            // });

            fragment.appendChild(enlace);
            } catch (error) {
                console.error(`❌ Error renderizando chat ${chat.id}:`, error);
                console.error('Stack:', error.stack);
            }
        });

        chatListEl.appendChild(fragment);
        mostrarLoading(false);
    }

    function completarPreviewDesdeMensajes(chatId, previewEl) {
        if (!db) return;

        if (lastMessageCache.has(chatId)) {
            const cached = lastMessageCache.get(chatId);
            if (cached) {
                previewEl.textContent = cached;
            }
            return;
        }

        db.collection("chats")
            .doc(chatId)
            .collection("messages")
            .orderBy("created_at", "desc")
            .limit(1)
            .get()
            .then((snapshot) => {
                const mensaje = snapshot.docs[0]?.data() || {};
                const texto =
                    (mensaje.message ||
                        mensaje.texto ||
                        mensaje.text ||
                        mensaje.body ||
                        mensaje.content ||
                        "")
                        .toString()
                        .trim() || defaultPreview;
                lastMessageCache.set(chatId, texto);
                previewEl.textContent = texto;
            })
            .catch((error) => {
                console.warn("No se pudo obtener el último mensaje del chat", chatId, error);
            });
    }

    function obtenerPedidoId(chat) {
        return (
            chat.pedido_id ||
            chat.metadata?.orderId ||
            chat.metadata?.pedidoId ||
            chat.order_id ||
            chat.id ||
            "pedido"
        );
    }

    function obtenerEtiquetaPedido(chat, pedidoId) {
        if (chat.pedido_folio) {
            return chat.pedido_folio;
        }
        if (chat.metadata?.orderFolio) {
            return chat.metadata.orderFolio;
        }
        const folio = pedidoId.toString().toUpperCase();
        if (!folio || folio === "PEDIDO") {
            return `Chat #${(chat.id || "").substring(0, 8).toUpperCase()}`;
        }
        return `Pedido #${folio.substring(0, 8)}`;
    }

    function obtenerPreview(chat) {
        const texto =
            chat.last_message ||
            chat.lastMessage ||
            chat.last_message_text ||
            chat.lastMessageText ||
            chat.ultimo_mensaje ||
            chat.preview ||
            chat.lastMessage?.text ||
            chat.last_message?.text ||
            "";
        return (texto || "").toString().trim();
    }

    function obtenerOtroParticipante(chat, currentUserId) {
        if (!chat || !currentUserId) {
            console.warn("⚠️ obtenerOtroParticipante: chat o currentUserId no válidos");
            return {
                id: "",
                nombre: "Contacto",
                unread: 0
            };
        }

        // Obtener el contador de mensajes no leídos del USUARIO ACTUAL, no del otro participante
        const unreadCount = chat.unreadCounts && typeof chat.unreadCounts[currentUserId] === "number"
            ? chat.unreadCounts[currentUserId]
            : 0;

        if (chat.participantsData && typeof chat.participantsData === "object") {
            for (const [id, datos] of Object.entries(chat.participantsData)) {
                if (id !== currentUserId && datos) {
                    return {
                        id: id || "",
                        nombre:
                            datos.nombre ||
                            datos.nombre_tienda ||
                            (datos.email ? datos.email.split("@")[0] : null) ||
                            "Contacto",
                        unread: unreadCount, // Contador del usuario actual
                    };
                }
            }
        }

        if (chat.comprador_id && chat.comprador_id !== currentUserId) {
            return {
                id: chat.comprador_id || "",
                nombre: chat.comprador_nombre || "Comprador",
                unread: unreadCount, // Contador del usuario actual
            };
        }
        if (chat.vendedor_id && chat.vendedor_id !== currentUserId) {
            return {
                id: chat.vendedor_id || "",
                nombre: chat.vendedor_nombre || "Vendedor",
                unread: unreadCount, // Contador del usuario actual
            };
        }

        const participantes = Array.isArray(chat.participants) ? chat.participants : [];
        const otherId = participantes.find((id) => id && id !== currentUserId) || "";

        return {
            id: otherId,
            nombre: chat[`perfil_${otherId}`] || chat.nombre_vendedor || "Contacto",
            unread: unreadCount, // Contador del usuario actual
        };
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

    function crearEnlaceConversacion(pedidoId, partnerName, partnerId) {
        const params = new URLSearchParams();
        params.set(partnerNameParam, partnerName);
        if (partnerId) {
            params.set(partnerIdParam, partnerId);
        }
        return `${chatBaseUrl}${encodeURIComponent(pedidoId)}?${params.toString()}`;
    }

    function formatearFechaRelativa(timestampMs) {
        const ahora = Date.now();
        const diff = ahora - timestampMs;

        if (Number.isNaN(diff)) {
            return "";
        }

        const minutos = Math.floor(diff / 60000);
        if (minutos < 1) return "Hace un momento";
        if (minutos < 60) return `Hace ${minutos} min`;

        const horas = Math.floor(minutos / 60);
        if (horas < 24) return `Hace ${horas} h`;

        const fecha = new Date(timestampMs);
        return fecha.toLocaleDateString("es-MX", {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    }

    function mostrarLoading(estado) {
        if (loadingEl) {
            loadingEl.style.display = estado ? "flex" : "none";
        }
    }

    function mostrarEmptyState(mensaje) {
        if (!emptyStateEl) {
            return;
        }

        if (mensaje === false) {
            emptyStateEl.style.display = "none";
            return;
        }

        if (loadingEl) {
            loadingEl.style.display = "none";
        }

        const texto = mensaje || defaultEmptyMessage;
        const paragraph = emptyStateEl.querySelector("p");
        if (paragraph) {
            paragraph.textContent = texto;
        } else {
            const p = document.createElement("p");
            p.textContent = texto;
            emptyStateEl.appendChild(p);
        }

        emptyStateEl.style.display = "flex";
    }

    // Función para cargar conversación dinámicamente en pantalla grande
    function cargarConversacionDinamica(pedidoId, partnerName, partnerId, iniciales, chatId) {
        try {
            const placeholder = document.getElementById('chatPlaceholder');
            const conversation = document.getElementById('chatConversation');
            const chatPartnerAvatar = document.getElementById('chatPartnerAvatar');
            const chatPartnerName = document.getElementById('chatPartnerName');
            const chatOrderLabel = document.getElementById('chatOrderLabel');
            const chatOrderLink = document.getElementById('chatOrderLink');
            const chatMessages = document.getElementById('chatMessages');
            const chatMessagesLoading = document.getElementById('chatMessagesLoading');

            if (!placeholder || !conversation) {
                // Si no existen los elementos, navegar normalmente
                console.warn('Elementos de conversación dinámica no encontrados, navegando normalmente');
                return false;
            }

        // Ocultar placeholder y mostrar conversación
        placeholder.style.display = 'none';
        conversation.style.display = 'flex';
        
        // Agregar clase para ocultar lista en móvil y mostrar botón volver
        conversation.classList.add('chat-conversation-active');
        const chatLayout = conversation.closest('.chat-layout');
        if (chatLayout) {
            chatLayout.classList.add('has-active-conversation');
        }
        
        // Mostrar botón volver móvil
        const chatBackBtnMobile = document.getElementById('chatBackBtnMobile');
        if (chatBackBtnMobile) {
            chatBackBtnMobile.style.display = 'flex';
        }

        // Actualizar header
        if (chatPartnerAvatar) {
            chatPartnerAvatar.textContent = iniciales;
        }
        if (chatPartnerName) {
            chatPartnerName.textContent = partnerName;
        }
        if (chatOrderLabel) {
            chatOrderLabel.textContent = `Pedido #${pedidoId}`;
        }
        if (chatOrderLink) {
            const orderLinkBase = body.dataset.orderLinkBase || 
                (body.dataset.chatRole === 'comprador' ? '/comprador/detalle_pedido/' : '/vendedor/ventas?pedido=');
            chatOrderLink.href = `${orderLinkBase}${pedidoId}`;
        }

        // Limpiar mensajes anteriores
        if (chatMessages) {
            chatMessages.innerHTML = '';
            if (chatMessagesLoading) {
                chatMessages.appendChild(chatMessagesLoading);
                chatMessagesLoading.style.display = 'flex';
            }
        }

        // Actualizar datos del body para que chat-conversation.js pueda usarlos
        if (body) {
            body.dataset.chatId = chatId || '';
            body.dataset.pedidoId = pedidoId;
            body.dataset.partnerId = partnerId || '';
            body.dataset.partnerName = partnerName || '';
        }

        // Marcar el chat como activo en la lista
        const chatItems = chatListEl.querySelectorAll('.chat-item');
        chatItems.forEach(item => {
            item.classList.remove('active');
            if (item.dataset.chatId === chatId) {
                item.classList.add('active');
            }
        });

            // Inicializar el chat si chat-conversation.js está disponible
            if (typeof window.inicializarChatDinamico === 'function') {
                window.inicializarChatDinamico(pedidoId, partnerId, partnerName, chatId);
            } else {
                // Si no existe la función, cargar los mensajes manualmente
                cargarMensajesChat(chatId, pedidoId);
            }
            
            return true;
        } catch (error) {
            console.error('Error en cargarConversacionDinamica:', error);
            return false;
        }
    }

    // Función para cargar mensajes del chat
    async function cargarMensajesChat(chatId, pedidoId) {
        if (!db || !auth) {
            return;
        }

        const chatMessages = document.getElementById('chatMessages');
        const chatMessagesLoading = document.getElementById('chatMessagesLoading');
        if (!chatMessages) return;

        try {
            const user = auth.currentUser;
            if (!user) return;

            // Buscar el chat
            const chatRef = db.collection('chats').doc(chatId);
            const chatDoc = await chatRef.get();

            if (!chatDoc.exists) {
                if (chatMessagesLoading) chatMessagesLoading.style.display = 'none';
                chatMessages.innerHTML = '<div class="chat-empty">No se encontró el chat.</div>';
                return;
            }

            // Limpiar mensajes anteriores
            chatMessages.innerHTML = '';
            if (chatMessagesLoading) {
                chatMessages.appendChild(chatMessagesLoading);
                chatMessagesLoading.style.display = 'flex';
            }

            // Suscribirse a los mensajes
            const messagesRef = chatRef.collection('messages').orderBy('created_at', 'asc');
            
            messagesRef.onSnapshot((snapshot) => {
                if (chatMessagesLoading) chatMessagesLoading.style.display = 'none';
                
                chatMessages.innerHTML = '';
                
                if (snapshot.empty) {
                    chatMessages.innerHTML = '<div class="chat-empty">No hay mensajes todavía.</div>';
                    return;
                }

                snapshot.docs.forEach((doc) => {
                    const mensaje = doc.data();
                    const esMio = mensaje.sender_id === user.uid;
                    const mensajeEl = crearElementoMensaje(mensaje, esMio);
                    chatMessages.appendChild(mensajeEl);
                });

                // Scroll al final
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }, (error) => {
                console.error('Error cargando mensajes:', error);
                if (chatMessagesLoading) chatMessagesLoading.style.display = 'none';
                chatMessages.innerHTML = '<div class="chat-error">Error al cargar mensajes.</div>';
            });

            // Configurar envío de mensajes
            configurarEnvioMensajes(chatId, chatRef, user.uid);

        } catch (error) {
            console.error('Error en cargarMensajesChat:', error);
            if (chatMessagesLoading) chatMessagesLoading.style.display = 'none';
            if (chatMessages) {
                chatMessages.innerHTML = '<div class="chat-error">Error al cargar el chat.</div>';
            }
        }
    }

    // Función para crear elemento de mensaje
    function crearElementoMensaje(mensaje, esMio) {
        const div = document.createElement('div');
        div.className = `chat-message ${esMio ? 'chat-message-sent' : 'chat-message-received'}`;
        
        const texto = mensaje.message || mensaje.texto || mensaje.text || '';
        const fecha = mensaje.created_at?.toDate ? mensaje.created_at.toDate() : new Date(mensaje.created_at);
        const hora = fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

        div.innerHTML = `
            <div class="chat-message-content">
                <p>${texto}</p>
                <span class="chat-message-time">${hora}</span>
            </div>
        `;

        return div;
    }

    // Variable para almacenar los listeners de envío de mensajes
    let currentSendMessageHandler = null;
    let currentKeypressHandler = null;

    // Función para configurar el envío de mensajes
    function configurarEnvioMensajes(chatId, chatRef, userId) {
        const chatInput = document.getElementById('chatInput');
        const chatSendBtn = document.getElementById('chatSendBtn');

        if (!chatInput || !chatSendBtn || !db) return;

        // Remover listeners anteriores si existen
        if (currentSendMessageHandler) {
            chatSendBtn.removeEventListener('click', currentSendMessageHandler);
        }
        if (currentKeypressHandler) {
            chatInput.removeEventListener('keypress', currentKeypressHandler);
        }

        const enviarMensaje = async () => {
            const texto = chatInput.value.trim();
            if (!texto) return;

            chatInput.disabled = true;
            chatSendBtn.disabled = true;

            try {
                const mensajeData = {
                    sender_id: userId,
                    message: texto,
                    created_at: firebase.firestore.FieldValue.serverTimestamp(),
                    tipo: 'texto'
                };

                await chatRef.collection('messages').add(mensajeData);
                chatInput.value = '';
            } catch (error) {
                console.error('Error enviando mensaje:', error);
            } finally {
                chatInput.disabled = false;
                chatSendBtn.disabled = false;
                chatInput.focus();
            }
        };

        // Guardar referencias a los handlers
        currentSendMessageHandler = enviarMensaje;
        currentKeypressHandler = (e) => {
            if (e.key === 'Enter') {
                enviarMensaje();
            }
        };

        chatSendBtn.addEventListener('click', currentSendMessageHandler);
        chatInput.addEventListener('keypress', currentKeypressHandler);
    }
})();

