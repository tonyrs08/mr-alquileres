// ================== CONFIGURACIÓN INICIAL Y PERMISOS ==================
if ("Notification" in window) {
    Notification.requestPermission();
}

const PRECIOS = { plasticas: 0.5, plegables: 1.0, cuadradas: 3.0, rectangular: 6.0 };
const STOCK_MR = { plasticas: 70, plegables: 60, cuadradas: 15, rectangular: 1 };

let actual = { cliente: "", direccion: "", fecha: "", hora: "", plasticas: 0, plegables: 0, cuadradas: 0, rectangular: 0, transporte: 0, total: 0 };

// ================== NAVEGACIÓN Y MENÚ ==================
function toggleMenu() {
    const menu = document.getElementById("side-menu");
    const overlay = document.getElementById("menu-overlay");
    if (menu.classList.contains("active")) {
        menu.classList.remove("active");
        overlay.style.display = "none";
    } else {
        menu.classList.add("active");
        overlay.style.display = "block";
    }
}

function cambiarVista(v) {
    document.querySelectorAll(".vista").forEach(e => e.style.display = "none");
    document.getElementById(v).style.display = "block";

    // Cerrar menú al seleccionar
    toggleMenu();

    if (v !== "vista-nueva") {
        limpiarFormulario();
    }

    if (v === "vista-cotizaciones" || v === "vista-agenda") cargarListasCompartidas();
    if (v === "vista-papelera") cargarPapelera();
    
    if (v === "vista-historial") {
        const hoy = new Date();
        document.getElementById("filtro-mes").value = hoy.toISOString().substring(0, 7);
        cargarHistorial();
    }
}

// ================== LÓGICA DE COTIZACIÓN (EDITABLE) ==================
async function cotizar() {
    const fechaSel = document.getElementById("fecha").value;
    const horaSel = document.getElementById("hora_entrega").value; 
    const cPla = +document.getElementById("plasticas").value || 0;
    const cPle = +document.getElementById("plegables").value || 0;
    const cCua = +document.getElementById("cuadradas").value || 0;
    const cRec = +document.getElementById("rectangular").value || 0;
    const cTra = +document.getElementById("transporte").value || 0;
    
    const idEdicion = document.getElementById("id_edicion").value;

    if (fechaSel) {
        let ocupado = { plasticas: 0, plegables: 0, cuadradas: 0, rectangular: 0 };
        const { collection, getDocs, query, where } = window.firebaseMethods;
        const carpetas = ["cotizaciones", "agenda"];
        for (const carpeta of carpetas) {
            const q = query(collection(window.db, carpeta), where("fecha", "==", fechaSel));
            const snap = await getDocs(q);
            snap.forEach((doc) => {
                const data = doc.data();
                // Ignorar las que están en papelera o si es la misma que editamos
                if (data.estado === "papelera") return; 
                if (idEdicion && doc.id === idEdicion) return;

                ocupado.plasticas += Number(data.plasticas || 0);
                ocupado.plegables += Number(data.plegables || 0);
                ocupado.cuadradas += Number(data.cuadradas || 0);
                ocupado.rectangular += Number(data.rectangular || 0);
            });
        }

        if (cPla > (STOCK_MR.plasticas - ocupado.plasticas)) { alert(`⚠️ Solo quedan ${STOCK_MR.plasticas - ocupado.plasticas} sillas plásticas.`); return; }
        if (cPle > (STOCK_MR.plegables - ocupado.plegables)) { alert(`⚠️ Solo quedan ${STOCK_MR.plegables - ocupado.plegables} sillas plegables.`); return; }
        if (cCua > (STOCK_MR.cuadradas - ocupado.cuadradas)) { alert(`⚠️ Solo quedan ${STOCK_MR.cuadradas - ocupado.cuadradas} mesas cuadradas.`); return; }
        if (cRec > (STOCK_MR.rectangular - ocupado.rectangular)) { alert(`⚠️ Mesa rectangular ocupada.`); return; }
    }

    actual = { 
        cliente: document.getElementById("cliente").value, 
        direccion: document.getElementById("direccion").value, 
        fecha: fechaSel, 
        hora: horaSel, 
        plasticas: cPla, plegables: cPle, cuadradas: cCua, rectangular: cRec, transporte: cTra 
    };
    
    const calculoMatematico = (actual.plasticas * PRECIOS.plasticas) + (actual.plegables * PRECIOS.plegables) + (actual.cuadradas * PRECIOS.cuadradas) + (actual.rectangular * PRECIOS.rectangular) + actual.transporte;
    
    document.getElementById("total-manual").value = calculoMatematico.toFixed(2);
}

async function guardarCotizacion() {
    actual.cliente = document.getElementById("cliente").value;
    actual.direccion = document.getElementById("direccion").value;
    actual.fecha = document.getElementById("fecha").value;
    actual.hora = document.getElementById("hora_entrega").value;
    actual.plasticas = +document.getElementById("plasticas").value;
    actual.plegables = +document.getElementById("plegables").value;
    actual.cuadradas = +document.getElementById("cuadradas").value;
    actual.rectangular = +document.getElementById("rectangular").value;
    actual.transporte = +document.getElementById("transporte").value;
    
    actual.total = Number(document.getElementById("total-manual").value);

    const idEdicion = document.getElementById("id_edicion").value;

    if (!actual.cliente || actual.total <= 0) return alert("⚠️ Completa los datos");
    
    const btn = document.querySelector(".btn-guardar");
    btn.disabled = true;
    btn.innerText = "⏳ PROCESANDO...";

    const { addDoc, collection, updateDoc, doc, getDocs, query, orderBy, limit } = window.firebaseMethods;

    try {
        if (idEdicion) {
            await updateDoc(doc(window.db, "cotizaciones", idEdicion), {
                ...actual,
                updatedAt: new Date().getTime(),
                estado: "pendiente" // Aseguramos que no esté en papelera al guardar
            });
            alert("✅ Cotización actualizada correctamente");
        } else {
            let folioMax = 0;
            const carpetas = ["cotizaciones", "agenda", "historial"];
            for (const col of carpetas) {
                const q = query(collection(window.db, col), orderBy("folio", "desc"), limit(1));
                const s = await getDocs(q);
                if(!s.empty) {
                    const f = parseInt(s.docs[0].data().folio) || 0;
                    if(f > folioMax) folioMax = f;
                }
            }
            let folioTexto = (folioMax + 1).toString().padStart(3, '0');
            await addDoc(collection(window.db, "cotizaciones"), { ...actual, folio: folioTexto, estado: "pendiente", createdAt: new Date().getTime() });
            alert(`✅ Guardada ✔ N°: ${folioTexto}`);
        }
        
        limpiarFormulario();
        cambiarVista('vista-cotizaciones');

    } catch (e) { 
        alert("❌ Error: " + e); 
    } finally {
        btn.disabled = false;
        btn.innerText = "💾 Guardar Cotización";
    }
}

// ================== FUNCIONES PARA EDICIÓN ==================
function cargarParaEditar(id, datosEncoded) {
    const datos = JSON.parse(decodeURIComponent(datosEncoded));
    
    document.getElementById("id_edicion").value = id;
    document.getElementById("cliente").value = datos.cliente;
    document.getElementById("direccion").value = datos.direccion;
    document.getElementById("fecha").value = datos.fecha;
    document.getElementById("hora_entrega").value = datos.hora || "";
    document.getElementById("plasticas").value = datos.plasticas || 0;
    document.getElementById("plegables").value = datos.plegables || 0;
    document.getElementById("cuadradas").value = datos.cuadradas || 0;
    document.getElementById("rectangular").value = datos.rectangular || 0;
    document.getElementById("transporte").value = datos.transporte || 0;
    
    document.getElementById("total-manual").value = Number(datos.total).toFixed(2);

    document.querySelector(".btn-guardar").innerText = "🔄 ACTUALIZAR CAMBIOS";
    document.getElementById("btn-cancelar-edicion").style.display = "block";
    document.querySelector("#vista-nueva h2").innerText = "📝 Editando: " + datos.cliente;

    cambiarVista("vista-nueva");
}

function limpiarFormulario() {
    document.getElementById("cliente").value = "";
    document.getElementById("direccion").value = "";
    document.getElementById("fecha").value = "";
    document.getElementById("hora_entrega").value = "";
    document.getElementById("plasticas").value = 0;
    document.getElementById("plegables").value = 0;
    document.getElementById("cuadradas").value = 0;
    document.getElementById("rectangular").value = 0;
    document.getElementById("transporte").value = 0;
    document.getElementById("total-manual").value = "0.00";
    
    document.getElementById("id_edicion").value = "";
    document.querySelector(".btn-guardar").innerText = "💾 Guardar Cotización";
    document.getElementById("btn-cancelar-edicion").style.display = "none";
    document.querySelector("#vista-nueva h2").innerText = "📝 Cotización";
}

// ================== LISTADOS Y NUBE ==================
function cargarListasCompartidas() {
    const { collection, onSnapshot, query, orderBy } = window.firebaseMethods;

    onSnapshot(query(collection(window.db, "cotizaciones"), orderBy("createdAt", "desc")), (snap) => {
        let html = "";
        snap.forEach((doc) => {
            const x = doc.data();
            // FILTRO: Si está en papelera, NO lo mostramos aquí
            if (x.estado === "papelera") return;

            const id = doc.id;
            const datosString = encodeURIComponent(JSON.stringify(x));

            html += `<div class="item-lista">
                <h3>${x.cliente.toUpperCase()}</h3>
                <div class="info-grid">📍 ${x.direccion}<br>📅 ${x.fecha} | 🕒 ${x.hora || '--:--'}<br><b>Total: $${Number(x.total).toFixed(2)}</b></div>
                <div class="acciones" style="grid-template-columns: 1fr 1fr 1fr;">
                    <button class="btn-confirmar" style="background:#f39c12; color:white;" onclick='cargarParaEditar("${id}", "${datosString}")'><span>✏️</span> EDITAR</button>
                    <button class="btn-pdf" onclick='descargarPDF_Firebase(${JSON.stringify(x)})'><span>📄</span> PDF</button>
                    <button class="btn-confirmar" onclick='confirmarEnNube("${id}", ${JSON.stringify(x)})'><span>✅</span> Agendar</button>
                    <button class="btn-borrar" onclick='borrarDeNube("cotizaciones", "${id}")'>🗑 PAPELERA</button>
                </div>
            </div>`;
        });
        document.getElementById("lista-cotizaciones").innerHTML = html || "<p>No hay presupuestos</p>";
    });

    onSnapshot(query(collection(window.db, "agenda"), orderBy("fecha", "asc")), (snap) => {
        let html = "";
        snap.forEach((doc) => {
            const x = doc.data();
            const id = doc.id;
            const colorBoton = x.estado === "entregado" ? "#3498db" : "#2ecc71";
            const textoBoton = x.estado === "entregado" ? "Recogido" : "Entregado";
            const iconoBoton = x.estado === "entregado" ? "📦" : "✔";

            html += `<div class="item-lista" style="border-left: 5px solid ${colorBoton}">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0;">${x.cliente.toUpperCase()}</h3>
                    <span style="background:${colorBoton}; color:white; padding:2px 8px; border-radius:4px; font-size:0.8em; font-weight:bold;">🕒 ${x.hora || '--:--'}</span>
                </div>
                <div class="info-grid" style="margin-top:5px;">📅 ${x.fecha} | 📍 ${x.direccion}<br>
                    <b style="color:#ffffff;">Total: $${Number(x.total).toFixed(2)}</b><br>
                    <b style="color:#d4af37;">Abono: $${Number(x.abono || 0).toFixed(2)} | SALDO: $${Number(x.saldoPendiente ?? x.total).toFixed(2)}</b>
                </div>
                <div class="acciones">
                    <button class="btn-pdf" onclick='descargarPDF_Firebase(${JSON.stringify(x)})'><span>📄</span>PDF</button>
                    <button class="btn-confirmar" style="background:#f39c12; color:white;" onclick='registrarAbono("${id}", ${JSON.stringify(x)})'><span>💰</span>Abonar</button>
                    <button class="btn-confirmar" style="background:${colorBoton}; color:white;" onclick='completarEvento("${id}", ${JSON.stringify(x)})'><span>${iconoBoton}</span>${textoBoton}</button>
                    <button class="btn-borrar" onclick='borrarDeNube("agenda", "${id}")'><span>🗑</span> ELIMINAR REGISTRO</button>
                </div>
            </div>`;
        });
        document.getElementById("lista-agenda").innerHTML = html || "<p>Agenda vacía</p>";
    });
}

// ================== PAPELERA DE RECICLAJE ==================
function cargarPapelera() {
    const { collection, getDocs, query, where, orderBy } = window.firebaseMethods;
    
    // Consultamos solo los que tienen estado == "papelera"
    const q = query(collection(window.db, "cotizaciones"), where("estado", "==", "papelera"));
    
    getDocs(q).then((snap) => {
        let html = "";
        if (snap.empty) {
            document.getElementById("lista-papelera").innerHTML = "<p>La papelera está vacía.</p>";
            return;
        }

        snap.forEach((doc) => {
            const x = doc.data();
            const id = doc.id;
            html += `<div class="item-lista item-papelera">
                <h3 style="color:#aaa;">${x.cliente.toUpperCase()} (Eliminado)</h3>
                <div class="info-grid">📅 Evento: ${x.fecha}<br>Total: $${Number(x.total).toFixed(2)}</div>
                <div class="acciones">
                    <button class="btn-confirmar btn-restaurar" style="grid-column: span 3;" onclick='restaurarDePapelera("${id}")'>♻️ RESTAURAR COTIZACIÓN</button>
                </div>
            </div>`;
        });
        document.getElementById("lista-papelera").innerHTML = html;
    });
}

async function restaurarDePapelera(id) {
    if(!confirm("¿Volver a activar esta cotización?")) return;
    const { updateDoc, doc } = window.firebaseMethods;
    try {
        await updateDoc(doc(window.db, "cotizaciones", id), { estado: "pendiente" });
        alert("♻️ Cotización restaurada. Revisa la lista de pendientes.");
        cargarPapelera(); // Refrescar papelera
    } catch (e) { alert("Error: " + e); }
}

async function limpiezaAutomaticaPapelera() {
    // Busca cotizaciones en papelera cuya fecha de evento ya pasó
    const { collection, getDocs, query, where, deleteDoc, doc } = window.firebaseMethods;
    const q = query(collection(window.db, "cotizaciones"), where("estado", "==", "papelera"));
    
    const snap = await getDocs(q);
    const hoy = new Date().toISOString().split('T')[0]; // Fecha formato YYYY-MM-DD

    snap.forEach(async (d) => {
        const data = d.data();
        // Si la fecha del evento es menor (anterior) a hoy, se borra definitivamente
        if (data.fecha && data.fecha < hoy) {
            console.log("Auto-limpieza: Borrando evento pasado de papelera", data.cliente);
            await deleteDoc(doc(window.db, "cotizaciones", d.id));
        }
    });
}

// ================== ACCIONES AGENDA ==================
async function confirmarEnNube(id, datos) {
    if(!confirm("¿Confirmar y agendar?")) return;
    const { addDoc, collection, deleteDoc, doc } = window.firebaseMethods;
    try {
        await addDoc(collection(window.db, "agenda"), { ...datos, abono: 0, saldoPendiente: datos.total, estado: "pendiente" });
        await deleteDoc(doc(window.db, "cotizaciones", id));
        alert("✅ Agendado correctamente");
    } catch (e) { alert("Error: " + e); }
}

async function registrarAbono(id, datos) {
    const monto = prompt(`Abono para: ${datos.cliente}\n¿Cuánto recibiste?`, "0");
    if (monto === null || monto === "" || isNaN(monto)) return;
    const { doc, updateDoc } = window.firebaseMethods;
    try {
        const nuevoAbono = Number(datos.abono || 0) + Number(monto);
        const nuevoSaldo = Number(datos.total) - nuevoAbono;
        await updateDoc(doc(window.db, "agenda", id), { abono: nuevoAbono, saldoPendiente: nuevoSaldo });
        alert("💰 Abono guardado");
    } catch (e) { alert("Error: " + e); }
}

async function completarEvento(id, datos) {
    const { addDoc, collection, deleteDoc, doc, updateDoc } = window.firebaseMethods;
    if (!datos.estado || datos.estado === "pendiente") {
        if(!confirm("¿Confirmar ENTREGA?\n(Esto sumará el dinero a la Caja)")) return;
        await updateDoc(doc(window.db, "agenda", id), { estado: "entregado" });
        alert("🚚 Entregado. Dinero registrado en Historial.");
    } else {
        if(!confirm("¿El equipo regresó a bodega?")) return;
        await addDoc(collection(window.db, "historial"), { ...datos, finalizadoAt: new Date().getTime(), estado: "finalizado" });
        await deleteDoc(doc(window.db, "agenda", id));
        alert("✅ Evento Cerrado y Archivado");
    }
}

// ================== GASTOS, RETIROS Y HISTORIAL ==================
async function registrarGasto() {
    const concepto = prompt("Concepto del gasto:");
    const monto = prompt("Monto ($):");
    if (!concepto || !monto || isNaN(monto)) return;
    const { addDoc, collection } = window.firebaseMethods;
    try {
        await addDoc(collection(window.db, "gastos"), { 
            concepto, 
            monto: Number(monto), 
            fecha: new Date().toISOString().split('T')[0], 
            mes: new Date().toISOString().substring(0, 7) 
        });
        alert("💸 Gasto registrado");
        cargarHistorial();
    } catch (e) { alert("Error: " + e); }
}

async function registrarRetiroTransporte() {
    const monto = prompt("¿Cuánto vas a retirar del fondo de transporte?");
    if (!monto || isNaN(monto)) return;
    const concepto = prompt("Motivo del retiro (ej. Gasolina, Taller):", "Retiro de caja");
    
    const { addDoc, collection } = window.firebaseMethods;
    try {
        await addDoc(collection(window.db, "retiros_transporte"), {
            concepto,
            monto: Number(monto),
            fecha: new Date().toISOString().split('T')[0],
            mes: new Date().toISOString().substring(0, 7)
        });
        alert("➖ Retiro registrado correctamente");
        cargarHistorial();
    } catch (e) { alert("Error: " + e); }
}

function cargarHistorial() {
    const { collection, onSnapshot, query, orderBy, getDocs, where } = window.firebaseMethods;
    const mesSel = document.getElementById("filtro-mes").value;
    
    if (!mesSel) return;

    // Escuchamos 'historial' (eventos finalizados)
    onSnapshot(query(collection(window.db, "historial"), orderBy("fecha", "desc")), async (snapHistorial) => {
        let ingresosPuros = 0; 
        let totalTransporte = 0; 
        let html = "<h4>💰 Detalle de Alquileres (Finalizados & Entregados)</h4>";
        
        // 1. Sumamos lo que ya está FINALIZADO (en historial)
        snapHistorial.forEach(docSnap => {
            const x = docSnap.data();
            if (x.fecha.includes(mesSel)) {
                const montoTrans = Number(x.transporte || 0);
                const montoAlquiler = Number(x.total) - montoTrans;
                
                ingresosPuros += montoAlquiler;
                totalTransporte += montoTrans;

                html += `<div class="item-lista" style="border-left:5px solid #2ecc71; display:flex; justify-content:space-between; align-items:center; padding:10px; margin-bottom:10px;">
                    <span><b>${x.cliente.toUpperCase()}</b> <small>(Archivado)</small><br>
                    <small>${x.fecha} | Mobiliario: $${montoAlquiler.toFixed(2)} | Trp: $${montoTrans.toFixed(2)}</small></span>
                    <button class="btn-borrar" style="width:auto; padding:8px; margin:0;" onclick='borrarDeNube("historial", "${docSnap.id}")'>🗑</button>
                </div>`;
            }
        });

        // 2. BUSCAMOS lo que está ENTREGADO en 'agenda' (Dinero ya recibido, pero sillas no devueltas)
        const qAgendaEntregado = query(collection(window.db, "agenda"), where("estado", "==", "entregado"));
        const snapAgenda = await getDocs(qAgendaEntregado);

        snapAgenda.forEach(docSnap => {
            const x = docSnap.data();
            // Verificamos que sea del mes seleccionado
            if (x.fecha.includes(mesSel)) {
                const montoTrans = Number(x.transporte || 0);
                const montoAlquiler = Number(x.total) - montoTrans;
                
                ingresosPuros += montoAlquiler;
                totalTransporte += montoTrans;

                // Lo mostramos en la lista con un color diferente (Azul) para indicar que está ACTIVO
                html += `<div class="item-lista" style="border-left:5px solid #3498db; background:rgba(52, 152, 219, 0.05); display:flex; justify-content:space-between; align-items:center; padding:10px; margin-bottom:10px;">
                    <span><b>${x.cliente.toUpperCase()}</b> <small style="color:#3498db; font-weight:bold;">(En Curso)</small><br>
                    <small>${x.fecha} | Mobiliario: $${montoAlquiler.toFixed(2)} | Trp: $${montoTrans.toFixed(2)}</small></span>
                    </div>`;
            }
        });

        // 3. Obtener Gastos Generales
        const qG = query(collection(window.db, "gastos"), where("mes", "==", mesSel));
        const snapG = await getDocs(qG);
        let gastosTotales = 0;
        let htmlG = "<h4 style='color:#e74c3c; margin-top:20px;'>💸 Gastos Generales</h4>";
        
        snapG.forEach(docSnap => {
            const g = docSnap.data();
            gastosTotales += Number(g.monto);
            htmlG += `<div class="item-lista" style="border-left:5px solid #e74c3c; background:rgba(231, 76, 60, 0.05); display:flex; justify-content:space-between; align-items:center; padding:10px; margin-bottom:10px;">
                <span><b>${g.concepto}</b><br><small>-$${Number(g.monto).toFixed(2)}</small></span>
                <button class="btn-borrar" style="width:auto; padding:8px; margin:0;" onclick='borrarDeNube("gastos", "${docSnap.id}")'>🗑</button>
            </div>`;
        });

        // 4. Obtener Retiros de Transporte
        const qR = query(collection(window.db, "retiros_transporte"), where("mes", "==", mesSel));
        const snapR = await getDocs(qR);
        let totalRetirosTransporte = 0;
        let htmlR = "<h4 style='color:#3498db; margin-top:20px;'>🚚 Retiros de Transporte</h4>";

        snapR.forEach(docSnap => {
            const r = docSnap.data();
            totalRetirosTransporte += Number(r.monto);
            htmlR += `<div class="item-lista" style="border-left:5px solid #3498db; background:rgba(52, 152, 219, 0.05); display:flex; justify-content:space-between; align-items:center; padding:10px; margin-bottom:10px;">
                <span><b>${r.concepto}</b><br><small>-$${Number(r.monto).toFixed(2)}</small></span>
                <button class="btn-borrar" style="width:auto; padding:8px; margin:0;" onclick='borrarDeNube("retiros_transporte", "${docSnap.id}")'>🗑</button>
            </div>`;
        });

        const netoReal = ingresosPuros - gastosTotales;
        const transporteDisponible = totalTransporte - totalRetirosTransporte;

        // PANEL DE RESULTADOS CON BOTÓN DE RETIRO
        document.getElementById("resumen-mensual").innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px;">
                <div style="background: rgba(46, 204, 113, 0.1); padding: 8px; border-radius: 10px; border: 1px solid #2ecc71; text-align: center;">
                    <span style="color: #2ecc71; font-size: 0.65rem; font-weight: bold; display: block;">Mobiliario</span>
                    <span style="font-size: 1.1rem; font-weight: bold; color: #2ecc71;">$${ingresosPuros.toFixed(2)}</span>
                </div>
                <div style="background: rgba(231, 76, 60, 0.1); padding: 8px; border-radius: 10px; border: 1px solid #e74c3c; text-align: center;">
                    <span style="color: #e74c3c; font-size: 0.65rem; font-weight: bold; display: block;">Gastos</span>
                    <span style="font-size: 1.1rem; font-weight: bold; color: #e74c3c;">$${gastosTotales.toFixed(2)}</span>
                </div>
            </div>

            <div style="background: rgba(52, 152, 219, 0.15); padding: 12px; border-radius: 12px; border: 1px solid #3498db; text-align: center; margin-bottom: 10px; position:relative;">
                <span style="color: #3498db; font-size: 0.7rem; font-weight: bold; display: block; text-transform: uppercase;">📦 Caja de Transporte (Disponible)</span>
                <span style="font-size: 1.5rem; font-weight: bold; color: #3498db;">$${transporteDisponible.toFixed(2)}</span>
                
                <div style="font-size:0.75rem; color:#aaa; margin-top:5px; border-top:1px dashed #3498db; padding-top:5px;">
                    Ingresos: $${totalTransporte.toFixed(2)} | Retiros: -$${totalRetirosTransporte.toFixed(2)}
                </div>

                <button onclick="registrarRetiroTransporte()" style="margin-top:10px; width:100%; display:block; background:#3498db; color:white; border:none; border-radius:8px; padding:10px; font-size:1rem; font-weight:bold; cursor:pointer;">
                    ➖ REGISTRAR RETIRO
                </button>
            </div>

            <div style="background: #d4af37; padding: 15px; border-radius: 15px; color: #050b1a; text-align: center; box-shadow: 0 4px 15px rgba(212, 175, 55, 0.3);">
                <span style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; display: block; margin-bottom: 3px;">Ganancia Neta Disponible</span>
                <span style="font-size: 2.2rem; font-weight: 900; display: block; line-height: 1;">$${netoReal.toFixed(2)}</span>
            </div>
        `;

        document.getElementById("lista-historial").innerHTML = html + htmlG + htmlR;
    });
}

// ================== UTILIDADES ==================
async function borrarDeNube(tipo, id) {
    // Si es cotización, ofrecemos mover a papelera (Soft Delete)
    if (tipo === "cotizaciones") {
        if(!confirm("¿Mover a papelera de reciclaje?")) return;
        const { updateDoc, doc } = window.firebaseMethods;
        await updateDoc(doc(window.db, tipo, id), { estado: "papelera" });
        return;
    }

    // Para el resto (agenda, historial, gastos) es borrado permanente
    if(!confirm("¿Borrar definitivamente?")) return;
    await window.firebaseMethods.deleteDoc(window.firebaseMethods.doc(window.db, tipo, id));
    if (tipo === "historial" || tipo === "gastos" || tipo === "retiros_transporte") cargarHistorial();
}

// ================== PDF Y EXPORTACIÓN ==================
function descargarPDF_Firebase(data) {
    localStorage.setItem("temp_pdf", JSON.stringify([data]));
    descargarPDF(0, "temp_pdf");
}

function descargarPDF(i, tipo) {
    let lista = JSON.parse(localStorage.getItem(tipo)) || [];
    let data = lista[i];
    let nFactura = data.folio || "000";
    const hoy = new Date();
    const fechaEmision = hoy.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const partesFecha = data.fecha.split('-');
    const fechaEventoFormateada = partesFecha.length === 3 ? `${partesFecha[2]}/${partesFecha[1]}/${partesFecha[0]}` : data.fecha;

    let ventana = window.open("", "_blank");
    ventana.document.write(`
        <html>
        <head>
            <title>Cotización MR - ${data.cliente}</title>
            <style>
                @media print { body { -webkit-print-color-adjust: exact; } } 
                body { font-family: Arial, sans-serif; padding: 40px; color: #333; background: #fff; } 
                .header { border-bottom: 4px solid #d4af37; padding-bottom: 15px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; } 
                .logo { width: 80px; height: 80px; object-fit: contain; } 
                .info-cliente { background: #f2f2f2 !important; padding: 15px; border-radius: 8px; margin-bottom: 25px; border: 1px solid #ddd; } 
                table { width: 100%; border-collapse: collapse; margin-top: 10px; } 
                th { background: #0b1f3a !important; color: white !important; padding: 12px; text-align: left; border: 1px solid #ddd; } 
                td { padding: 10px; border: 1px solid #ddd; } 
                .total { text-align: right; font-size: 22px; font-weight: bold; color: #0b1f3a; margin-top: 20px; } 
                .notas { margin-top: 40px; padding: 15px; border: 1px dashed #d4af37; background: #fffcf5 !important; font-size: 12px; border-radius: 5px; }
            </style>
        </head>
        <body>
            <div class="header">
                <div style="display: flex; align-items: center; gap: 15px;">
                    <img src="logo.jpg" class="logo">
                    <div>
                        <h1 style="margin:0; color:#d4af37; font-size: 28px;">MR ALQUILERES</h1>
                        <p style="margin:0; color: #666;">Mobiliario y Mantelería para Eventos</p>
                    </div>
                </div>
                <div style="text-align: right;">
                    <h2 style="margin:0; color: #0b1f3a;">COTIZACIÓN</h2>
                    <p style="margin:5px 0 0 0;"><b>N°: ${nFactura}</b></p>
                    <p style="margin:2px 0; font-size: 14px;">Emisión: ${fechaEmision}</p>
                    <p style="margin:0; color:#d4af37;"><b>Evento: ${fechaEventoFormateada}</b></p>
                    <p style="margin:2px 0 0 0; font-size: 14px;"><b>Hora: ${data.hora || '--:--'}</b></p>
                </div>
            </div>

            <div class="info-cliente">
                <p style="margin:0;"><b>CLIENTE:</b> ${data.cliente.toUpperCase()}</p>
                <p style="margin:5px 0 0 0;"><b>DIRECCIÓN:</b> ${data.direccion}</p>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>Descripción</th>
                        <th style="text-align:center;">Cant.</th>
                        <th style="text-align:center;">Precio Unit.</th>
                        <th style="text-align:right;">Subtotal</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.plasticas > 0 ? `<tr><td>Sillas Plásticas</td><td style="text-align:center;">${data.plasticas}</td><td style="text-align:center;">$0.50</td><td style="text-align:right;">$${(data.plasticas * 0.5).toFixed(2)}</td></tr>` : ''}
                    ${data.plegables > 0 ? `<tr><td>Sillas Plegables</td><td style="text-align:center;">${data.plegables}</td><td style="text-align:center;">$1.00</td><td style="text-align:right;">$${(data.plegables * 1.0).toFixed(2)}</td></tr>` : ''}
                    ${data.cuadradas > 0 ? `<tr><td>Mesas Cuadradas</td><td style="text-align:center;">${data.cuadradas}</td><td style="text-align:center;">$3.00</td><td style="text-align:right;">$${(data.cuadradas * 3.0).toFixed(2)}</td></tr>` : ''}
                    ${data.rectangular > 0 ? `<tr><td>Mesa Rectangular</td><td style="text-align:center;">${data.rectangular}</td><td style="text-align:center;">$6.00</td><td style="text-align:right;">$${(data.rectangular * 6.0).toFixed(2)}</td></tr>` : ''}
                    ${data.transporte > 0 ? `<tr><td>Transporte</td><td style="text-align:center;">1</td><td style="text-align:center;">$${Number(data.transporte).toFixed(2)}</td><td style="text-align:right;">$${Number(data.transporte).toFixed(2)}</td></tr>` : ''}
                </tbody>
            </table>

            <div class="total">TOTAL A PAGAR: $${Number(data.total).toFixed(2)}</div>

            <div class="notas">
                <b>TÉRMINOS Y CONDICIONES:</b><br>
                • Se requiere un abono del 50% para separar la fecha del evento.<br>
                • Cualquier daño al mobiliario o mantelería deberá ser cubierto por el cliente en su totalidad.
            </div>

            <script>
                window.onload = function() { setTimeout(() => { window.print(); }, 800); };
            </script>
        </body>
        </html>
    `);
    ventana.document.close();
}

function iniciarVigilante() {
    // Hemos eliminado las notificaciones como pediste
    console.log("Sistema de vigilancia activo (Sin notificaciones)");
}

// ================== CARGA INICIAL Y STOCK VISIBLE ==================
window.addEventListener('load', () => { 
    cargarListasCompartidas(); 
    iniciarVigilante();
    limpiezaAutomaticaPapelera(); // Lanza la limpieza al abrir

    const hoy = new Date();
    const fMes = document.getElementById("filtro-mes");
    if(fMes) fMes.value = hoy.toISOString().substring(0, 7);

    const items = ["plasticas", "plegables", "cuadradas", "rectangular"];
    items.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            let etiqueta = document.getElementById(`info-${id}`);
            if (!etiqueta) {
                etiqueta = document.createElement("div");
                etiqueta.id = `info-${id}`;
                etiqueta.style.color = "#f39c12"; 
                etiqueta.style.fontSize = "12px";
                etiqueta.style.marginTop = "5px";
                etiqueta.style.textAlign = "center";
                etiqueta.style.fontWeight = "bold";
                input.parentNode.insertBefore(etiqueta, input.nextSibling);
            }
            etiqueta.innerText = `$${PRECIOS[id].toFixed(2)} c/u | Stock: ${STOCK_MR[id]}`;
        }
    });
});