// ================== CONFIGURACIÓN INICIAL Y PERMISOS ==================
if ("Notification" in window) {
    Notification.requestPermission();
}

const PRECIOS = { plasticas: 0.5, plegables: 1.0, cuadradas: 3.0, rectangular: 6.0 };
const STOCK_MR = { plasticas: 70, plegables: 60, cuadradas: 15, rectangular: 1 };

let actual = { cliente: "", direccion: "", fecha: "", hora: "", plasticas: 0, plegables: 0, cuadradas: 0, rectangular: 0, transporte: 0, total: 0 };

// ================== NAVEGACIÓN ==================
function cambiarVista(v) {
    document.querySelectorAll(".vista").forEach(e => e.style.display = "none");
    document.getElementById(v).style.display = "block";

    if (v === "vista-cotizaciones" || v === "vista-agenda") cargarListasCompartidas();
    
    if (v === "vista-historial") {
        const hoy = new Date();
        document.getElementById("filtro-mes").value = hoy.toISOString().substring(0, 7);
        cargarHistorial();
    }
}

// ================== LÓGICA DE NEGOCIO ==================
async function cotizar() {
    const fechaSel = document.getElementById("fecha").value;
    const horaSel = document.getElementById("hora_entrega").value; 
    const cPla = +document.getElementById("plasticas").value || 0;
    const cPle = +document.getElementById("plegables").value || 0;
    const cCua = +document.getElementById("cuadradas").value || 0;
    const cRec = +document.getElementById("rectangular").value || 0;
    const cTra = +document.getElementById("transporte").value || 0;

    if (fechaSel) {
        let ocupado = { plasticas: 0, plegables: 0, cuadradas: 0, rectangular: 0 };
        const { collection, getDocs, query, where } = window.firebaseMethods;
        const carpetas = ["cotizaciones", "agenda"];
        for (const carpeta of carpetas) {
            const q = query(collection(window.db, carpeta), where("fecha", "==", fechaSel));
            const snap = await getDocs(q);
            snap.forEach((doc) => {
                const reg = doc.data();
                ocupado.plasticas += Number(reg.plasticas || 0);
                ocupado.plegables += Number(reg.plegables || 0);
                ocupado.cuadradas += Number(reg.cuadradas || 0);
                ocupado.rectangular += Number(reg.rectangular || 0);
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
    
    actual.total = (actual.plasticas * PRECIOS.plasticas) + (actual.plegables * PRECIOS.plegables) + (actual.cuadradas * PRECIOS.cuadradas) + (actual.rectangular * PRECIOS.rectangular) + actual.transporte;
    document.getElementById("total").innerText = `$${actual.total.toFixed(2)}`;
}

async function guardarCotizacion() {
    if (!actual.cliente || actual.total <= 0) return alert("⚠️ Completa los datos");
    const { addDoc, collection, getDocs, query, orderBy, limit } = window.firebaseMethods;

    try {
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

        await addDoc(collection(window.db, "cotizaciones"), { 
            ...actual, 
            folio: folioTexto,
            createdAt: new Date().getTime() 
        });

        alert(`✅ Guardada ✔ N°: ${folioTexto}`);
        location.reload(); 
    } catch (e) { alert("❌ Error: " + e); }
}

// ================== LISTADOS Y NUBE ==================
function cargarListasCompartidas() {
    const { collection, onSnapshot, query, orderBy } = window.firebaseMethods;

    // Cotizaciones
    onSnapshot(query(collection(window.db, "cotizaciones"), orderBy("createdAt", "desc")), (snap) => {
        let html = "";
        snap.forEach((doc) => {
            const x = doc.data();
            const id = doc.id;
            html += `<div class="item-lista">
                <h3>${x.cliente}</h3>
                <div class="info-grid">📍 ${x.direccion}<br>📅 ${x.fecha} | 🕒 ${x.hora || '--:--'}<br><b>Total: $${Number(x.total).toFixed(2)}</b></div>
                <div class="acciones">
                    <button class="btn-pdf" onclick='descargarPDF_Firebase(${JSON.stringify(x)})'>📄 PDF</button>
                    <button class="btn-confirmar" onclick='confirmarEnNube("${id}", ${JSON.stringify(x)})'>✅ Agendar</button>
                    <button class="btn-borrar" onclick='borrarDeNube("cotizaciones", "${id}")'>🗑</button>
                </div>
            </div>`;
        });
        document.getElementById("lista-cotizaciones").innerHTML = html || "<p>No hay presupuestos</p>";
    });

    // Agenda con Hora, Saldos y Estados
    onSnapshot(query(collection(window.db, "agenda"), orderBy("fecha", "asc")), (snap) => {
        let html = "";
        snap.forEach((doc) => {
            const x = doc.data();
            const id = doc.id;

            // Lógica de colores y estados para recolección
            const colorBoton = x.estado === "entregado" ? "#3498db" : "#2ecc71";
            const textoBoton = x.estado === "entregado" ? "📦 Recogido" : "✔ Entregado";
            const bordeCard = x.estado === "entregado" ? "5px solid #3498db" : "5px solid #2ecc71";

            // Mensaje de WhatsApp
            const textoWA = `Hola ${x.cliente.toUpperCase()}, MR ALQUILERES le confirma su pedido para el día ${x.fecha} a las ${x.hora || '--:--'}. Saldo pendiente: $${Number(x.saldoPendiente ?? x.total).toFixed(2)}.`;
            const urlWA = `https://wa.me/?text=${encodeURIComponent(textoWA)}`;

            html += `<div class="item-lista" style="border-left: ${bordeCard}">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0;">${x.cliente.toUpperCase()}</h3>
                    <span style="background:${colorBoton}; color:white; padding:2px 8px; border-radius:4px; font-size:0.8em; font-weight:bold;">🕒 ${x.hora || '--:--'}</span>
                </div>
                <div class="info-grid" style="margin-top:5px;">📅 ${x.fecha} | 📍 ${x.direccion}<br>
                    <b style="color:#2c3e50;">Total: $${Number(x.total).toFixed(2)}</b><br>
                    <b style="color:#e67e22;">Pagado: $${Number(x.abono || 0).toFixed(2)} | SALDO: $${Number(x.saldoPendiente ?? x.total).toFixed(2)}</b>
                </div>
                <div class="acciones">
                    <button class="btn-pdf" onclick='descargarPDF_Firebase(${JSON.stringify(x)})'>📄 PDF</button>
                    <button class="btn-confirmar" style="background:#25D366; color:white;" onclick="window.open('${urlWA}')">📱 WhatsApp</button>
                    <button class="btn-confirmar" style="background:#f39c12; color:white;" onclick='registrarAbono("${id}", ${JSON.stringify(x)})'>💰 Abonar</button>
                    <button class="btn-confirmar" style="background:${colorBoton}; color:white;" onclick='completarEvento("${id}", ${JSON.stringify(x)})'>${textoBoton}</button>
                    <button class="btn-borrar" onclick='borrarDeNube("agenda", "${id}")'>🗑</button>
                </div>
            </div>`;
        });
        document.getElementById("lista-agenda").innerHTML = html || "<p>Agenda vacía</p>";
    });
}

async function registrarAbono(id, datos) {
    const monto = prompt(`Registrar nuevo abono para: ${datos.cliente}\nSaldo actual: $${Number(datos.saldoPendiente ?? datos.total).toFixed(2)}\n\n¿Cuánto dinero recibiste?`, "0");
    
    if (monto === null || monto === "" || isNaN(monto)) return;

    const { doc, updateDoc } = window.firebaseMethods;
    try {
        const nuevoAbono = Number(datos.abono || 0) + Number(monto);
        const nuevoSaldo = Number(datos.total) - nuevoAbono;

        const ref = doc(window.db, "agenda", id);
        await updateDoc(ref, {
            abono: nuevoAbono,
            saldoPendiente: nuevoSaldo
        });
        alert("💰 Abono registrado correctamente");
    } catch (e) { alert("Error: " + e); }
}

async function completarEvento(id, datos) {
    const { addDoc, collection, deleteDoc, doc, updateDoc } = window.firebaseMethods;
    
    if (!datos.estado || datos.estado === "pendiente") {
        if(!confirm("¿Confirmar que el pedido fue ENTREGADO al cliente?")) return;
        try {
            const ref = doc(window.db, "agenda", id);
            await updateDoc(ref, { estado: "entregado" });
            alert("🚚 Marcado como ENTREGADO. Queda pendiente para RECOGER.");
        } catch (e) { alert("Error: " + e); }
    } 
    else if (datos.estado === "entregado") {
        if(!confirm("¿Confirmar que el equipo ya regresó a BODEGA? (Se guardará en historial)")) return;
        try {
            await addDoc(collection(window.db, "historial"), { 
                ...datos, 
                finalizadoAt: new Date().getTime(),
                estado: "finalizado" 
            });
            await deleteDoc(doc(window.db, "agenda", id));
            alert("✅ Pedido finalizado y guardado en historial.");
        } catch (e) { alert("Error: " + e); }
    }
}

async function confirmarEnNube(id, datos) {
    if(!confirm("¿Confirmar y agendar?")) return;
    const { addDoc, collection, deleteDoc, doc } = window.firebaseMethods;
    try {
        await addDoc(collection(window.db, "agenda"), { 
            ...datos, 
            abono: 0, 
            saldoPendiente: datos.total,
            estado: "pendiente" 
        });
        await deleteDoc(doc(window.db, "cotizaciones", id));
    } catch (e) { alert("Error: " + e); }
}

async function borrarDeNube(tipo, id) {
    if(!confirm("¿Eliminar?")) return;
    const { deleteDoc, doc } = window.firebaseMethods;
    await deleteDoc(doc(window.db, tipo, id));
}

function cargarHistorial() {
    const { collection, onSnapshot, query, orderBy } = window.firebaseMethods;
    const mesSel = document.getElementById("filtro-mes").value;
    
    onSnapshot(query(collection(window.db, "historial"), orderBy("fecha", "desc")), (snap) => {
        const contenedor = document.getElementById('lista-historial');
        if (!contenedor) return;
        let html = ""; let suma = 0;
        snap.forEach((docSnap) => {
            const x = docSnap.data();
            if (x.fecha.includes(mesSel)) {
                suma += Number(x.total);
                html += `<div class="item-lista" style="border-left: 5px solid #3498db; opacity: 0.85;">
                    <div style="display:flex; justify-content:space-between;"><h3>${x.cliente.toUpperCase()}</h3><span>#${x.folio}</span></div>
                    <div class="info-grid">📅 ${x.fecha} | Ganancia: <b>$${Number(x.total).toFixed(2)}</b><br>
                    <small>Items: ${x.plasticas}P, ${x.plegables}Pl, ${x.cuadradas}M, ${x.rectangular}R</small></div>
                </div>`;
            }
        });
        contenedor.innerHTML = html || "<p style='text-align:center;'>Sin entregas este mes.</p>";
        document.getElementById("resumen-mensual").innerHTML = `Ganancia Total ${mesSel}:<br><span style="font-size:1.4em; color:#27ae60;">$${suma.toFixed(2)}</span>`;
    });
}

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
    ventana.document.write(`<html><head><title>Cotización MR - ${data.cliente}</title><style>@media print { body { -webkit-print-color-adjust: exact; } } body { font-family: Arial, sans-serif; padding: 40px; color: #333; background: #fff; } .header { border-bottom: 4px solid #d4af37; padding-bottom: 15px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; } .logo { width: 80px; height: 80px; object-fit: contain; } .info-cliente { background: #f2f2f2 !important; padding: 15px; border-radius: 8px; margin-bottom: 25px; border: 1px solid #ddd; } table { width: 100%; border-collapse: collapse; margin-top: 10px; } th { background: #0b1f3a !important; color: white !important; padding: 12px; text-align: left; border: 1px solid #ddd; } td { padding: 10px; border: 1px solid #ddd; } .total { text-align: right; font-size: 22px; font-weight: bold; color: #0b1f3a; margin-top: 20px; } .notas { margin-top: 40px; padding: 15px; border: 1px dashed #d4af37; background: #fffcf5 !important; font-size: 12px; border-radius: 5px; }</style></head><body><div class="header"><div style="display: flex; align-items: center; gap: 15px;"><img src="logo.jpg" class="logo"><div><h1 style="margin:0; color:#d4af37; font-size: 28px;">MR ALQUILERES</h1><p style="margin:0; color: #666;">Mobiliario y Mantelería para Eventos</p></div></div><div style="text-align: right;"><h2 style="margin:0; color: #0b1f3a;">COTIZACIÓN</h2><p style="margin:5px 0 0 0;"><b>N°: ${nFactura}</b></p><p style="margin:2px 0; font-size: 14px;">Emisión: ${fechaEmision}</p><p style="margin:0; color:#d4af37;"><b>Evento: ${fechaEventoFormateada}</b></p></div></div><div class="info-cliente"><p style="margin:0;"><b>CLIENTE:</b> ${data.cliente.toUpperCase()}</p><p style="margin:5px 0 0 0;"><b>DIRECCIÓN:</b> ${data.direccion}</p></div><table><thead><tr><th>Descripción</th><th style="text-align:center;">Cant.</th><th style="text-align:right;">Subtotal</th></tr></thead><tbody>${data.plasticas > 0 ? `<tr><td>Sillas Plásticas</td><td style="text-align:center;">${data.plasticas}</td><td style="text-align:right;">$${(data.plasticas * 0.5).toFixed(2)}</td></tr>` : ''}${data.plegables > 0 ? `<tr><td>Sillas Plegables</td><td style="text-align:center;">${data.plegables}</td><td style="text-align:right;">$${(data.plegables * 1.0).toFixed(2)}</td></tr>` : ''}${data.cuadradas > 0 ? `<tr><td>Mesas Cuadradas</td><td style="text-align:center;">${data.cuadradas}</td><td style="text-align:right;">$${(data.cuadradas * 3.0).toFixed(2)}</td></tr>` : ''}${data.rectangular > 0 ? `<tr><td>Mesa Rectangular</td><td style="text-align:center;">${data.rectangular}</td><td style="text-align:right;">$${(data.rectangular * 6.0).toFixed(2)}</td></tr>` : ''}${data.transporte > 0 ? `<tr><td>Transporte</td><td style="text-align:center;">1</td><td style="text-align:right;">$${Number(data.transporte).toFixed(2)}</td></tr>` : ''}</tbody></table><div class="total">TOTAL A PAGAR: $${Number(data.total).toFixed(2)}</div><div class="notas"><b>TÉRMINOS Y CONDICIONES:</b><br>• Se requiere un abono del 50% para separar la fecha del evento.<br>• Cualquier daño al mobiliario o mantelería deberá ser cubierto por el cliente en su totalidad.</div><script>window.onload = function() { setTimeout(() => { window.print(); }, 800); };</script></body></html>`);
    ventana.document.close();
}

function revisarRecordatorios() {
    const { collection, onSnapshot, query, where } = window.firebaseMethods;
    const hoy = new Date().toISOString().split('T')[0];
    onSnapshot(query(collection(window.db, "agenda"), where("fecha", "==", hoy)), (snap) => {
        snap.forEach(doc => {
            const e = doc.data();
            alert(`📢 EVENTO HOY A LAS ${e.hora || '---'}:\n👤 ${e.cliente.toUpperCase()}\n📍 ${e.direccion}`);
        });
    });
}

function iniciarVigilante() {
    setInterval(async () => {
        const { collection, getDocs, query, where } = window.firebaseMethods;
        const ahora = new Date();
        const fechaHoy = ahora.toISOString().split('T')[0];
        const q = query(collection(window.db, "agenda"), where("fecha", "==", fechaHoy));
        const snap = await getDocs(q);
        snap.forEach(doc => {
            const evento = doc.data();
            if (!evento.hora) return;
            const [h, m] = evento.hora.split(':');
            const horaEvento = new Date();
            horaEvento.setHours(h, m, 0);
            const diferenciaMinutos = Math.round((horaEvento - ahora) / 60000);
            if (diferenciaMinutos === 60) {
                new Notification("🚚 MR ALQUILERES", {
                    body: `¡Entrega en 1 hora!\nCliente: ${evento.cliente}\n📍 ${evento.direccion}`,
                    icon: "logo.jpg"
                });
            }
        });
    }, 60000);
}

// CARGA INICIAL
window.addEventListener('load', () => {
    revisarRecordatorios();
    cargarListasCompartidas();
    iniciarVigilante();
});