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
    const btn = document.querySelector(".btn-guardar");
    btn.disabled = true;
    btn.innerText = "⏳ GUARDANDO...";

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
        await addDoc(collection(window.db, "cotizaciones"), { ...actual, folio: folioTexto, createdAt: new Date().getTime() });

        alert(`✅ Guardada ✔ N°: ${folioTexto}`);
        location.reload(); 
    } catch (e) { 
        alert("❌ Error: " + e); 
        btn.disabled = false;
        btn.innerText = "💾 Guardar Cotización";
    }
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
                <h3>${x.cliente.toUpperCase()}</h3>
                <div class="info-grid">📍 ${x.direccion}<br>📅 ${x.fecha} | 🕒 ${x.hora || '--:--'}<br><b>Total: $${Number(x.total).toFixed(2)}</b></div>
                <div class="acciones" style="grid-template-columns: 1fr 1fr;">
                    <button class="btn-pdf" onclick='descargarPDF_Firebase(${JSON.stringify(x)})'><span>📄</span> PDF</button>
                    <button class="btn-confirmar" onclick='confirmarEnNube("${id}", ${JSON.stringify(x)})'><span>✅</span> Agendar</button>
                    <button class="btn-borrar" onclick='borrarDeNube("cotizaciones", "${id}")'>🗑 ELIMINAR</button>
                </div>
            </div>`;
        });
        document.getElementById("lista-cotizaciones").innerHTML = html || "<p>No hay presupuestos</p>";
    });

    // Agenda
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

// ================== FUNCIONES DE ACCIÓN ==================
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
        if(!confirm("¿Confirmar ENTREGA?")) return;
        await updateDoc(doc(window.db, "agenda", id), { estado: "entregado" });
        alert("🚚 Entregado. Pendiente de recoger.");
    } else {
        if(!confirm("¿El equipo regresó a bodega?")) return;
        await addDoc(collection(window.db, "historial"), { ...datos, finalizadoAt: new Date().getTime(), estado: "finalizado" });
        await deleteDoc(doc(window.db, "agenda", id));
        alert("✅ Guardado en Historial");
    }
}

// ================== GASTOS E HISTORIAL ==================
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

function cargarHistorial() {
    const { collection, onSnapshot, query, orderBy, getDocs, where } = window.firebaseMethods;
    const mesSel = document.getElementById("filtro-mes").value;
    
    if (!mesSel) return;

    onSnapshot(query(collection(window.db, "historial"), orderBy("fecha", "desc")), async (snap) => {
        let ingresosPuros = 0; 
        let totalTransporte = 0; 
        let html = "<h4>💰 Detalle de Alquileres Realizados</h4>";
        
        snap.forEach(docSnap => {
            const x = docSnap.data();
            // Solo sumamos si el registro pertenece al mes seleccionado
            if (x.fecha.includes(mesSel)) {
                // Separamos el transporte del total
                const montoTrans = Number(x.transporte || 0);
                const montoAlquiler = Number(x.total) - montoTrans;
                
                ingresosPuros += montoAlquiler;
                totalTransporte += montoTrans;

                html += `<div class="item-lista" style="border-left:5px solid #2ecc71; display:flex; justify-content:space-between; align-items:center; padding:10px; margin-bottom:10px;">
                    <span><b>${x.cliente.toUpperCase()}</b><br>
                    <small>${x.fecha} | Mobiliario: $${montoAlquiler.toFixed(2)} | Trp: $${montoTrans.toFixed(2)}</small></span>
                    <button class="btn-borrar" style="width:auto; padding:8px; margin:0;" onclick='borrarDeNube("historial", "${docSnap.id}")'>🗑</button>
                </div>`;
            }
        });

        const qG = query(collection(window.db, "gastos"), where("mes", "==", mesSel));
        const snapG = await getDocs(qG);
        let gastosTotales = 0;
        let htmlG = "<h4 style='color:#e74c3c; margin-top:20px;'>💸 Detalle de Gastos</h4>";
        
        snapG.forEach(docSnap => {
            const g = docSnap.data();
            gastosTotales += Number(g.monto);
            htmlG += `<div class="item-lista" style="border-left:5px solid #e74c3c; background:rgba(231, 76, 60, 0.05); display:flex; justify-content:space-between; align-items:center; padding:10px; margin-bottom:10px;">
                <span><b>${g.concepto}</b><br><small>-$${Number(g.monto).toFixed(2)}</small></span>
                <button class="btn-borrar" style="width:auto; padding:8px; margin:0;" onclick='borrarDeNube("gastos", "${docSnap.id}")'>🗑</button>
            </div>`;
        });

        const netoReal = ingresosPuros - gastosTotales;

        // PANEL DE RESULTADOS CON SEPARACIÓN DE CAJA
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

            <div style="background: rgba(52, 152, 219, 0.15); padding: 12px; border-radius: 12px; border: 1px solid #3498db; text-align: center; margin-bottom: 10px;">
                <span style="color: #3498db; font-size: 0.7rem; font-weight: bold; display: block; text-transform: uppercase;">📦 Caja de Transporte (Fondo Carro)</span>
                <span style="font-size: 1.5rem; font-weight: bold; color: #3498db;">$${totalTransporte.toFixed(2)}</span>
            </div>

            <div style="background: #d4af37; padding: 15px; border-radius: 15px; color: #050b1a; text-align: center; box-shadow: 0 4px 15px rgba(212, 175, 55, 0.3);">
                <span style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; display: block; margin-bottom: 3px;">Ganancia Neta Disponible</span>
                <span style="font-size: 2.2rem; font-weight: 900; display: block; line-height: 1;">$${netoReal.toFixed(2)}</span>
            </div>
        `;

        document.getElementById("lista-historial").innerHTML = html + htmlG;
    });
}

// ================== UTILIDADES Y VIGILANTE ==================
async function borrarDeNube(tipo, id) {
    if(!confirm("¿Borrar definitivamente?")) return;
    await window.firebaseMethods.deleteDoc(window.firebaseMethods.doc(window.db, tipo, id));
    if (tipo === "historial" || tipo === "gastos") cargarHistorial();
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
    ventana.document.write(`<html><head><title>Cotización MR - ${data.cliente}</title><style>@media print { body { -webkit-print-color-adjust: exact; } } body { font-family: Arial, sans-serif; padding: 40px; color: #333; background: #fff; } .header { border-bottom: 4px solid #d4af37; padding-bottom: 15px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; } .logo { width: 80px; height: 80px; object-fit: contain; } .info-cliente { background: #f2f2f2 !important; padding: 15px; border-radius: 8px; margin-bottom: 25px; border: 1px solid #ddd; } table { width: 100%; border-collapse: collapse; margin-top: 10px; } th { background: #0b1f3a !important; color: white !important; padding: 12px; text-align: left; border: 1px solid #ddd; } td { padding: 10px; border: 1px solid #ddd; } .total { text-align: right; font-size: 22px; font-weight: bold; color: #0b1f3a; margin-top: 20px; } .notas { margin-top: 40px; padding: 15px; border: 1px dashed #d4af37; background: #fffcf5 !important; font-size: 12px; border-radius: 5px; }</style></head><body><div class="header"><div style="display: flex; align-items: center; gap: 15px;"><img src="logo.jpg" class="logo"><div><h1 style="margin:0; color:#d4af37; font-size: 28px;">MR ALQUILERES</h1><p style="margin:0; color: #666;">Mobiliario y Mantelería para Eventos</p></div></div><div style="text-align: right;"><h2 style="margin:0; color: #0b1f3a;">COTIZACIÓN</h2><p style="margin:5px 0 0 0;"><b>N°: ${nFactura}</b></p><p style="margin:2px 0; font-size: 14px;">Emisión: ${fechaEmision}</p><p style="margin:0; color:#d4af37;"><b>Evento: ${fechaEventoFormateada}</b></p></div></div><div class="info-cliente"><p style="margin:0;"><b>CLIENTE:</b> ${data.cliente.toUpperCase()}</p><p style="margin:5px 0 0 0;"><b>DIRECCIÓN:</b> ${data.direccion}</p></div><table><thead><tr><th>Descripción</th><th style="text-align:center;">Cant.</th><th style="text-align:right;">Subtotal</th></tr></thead><tbody>${data.plasticas > 0 ? `<tr><td>Sillas Plásticas</td><td style="text-align:center;">${data.plasticas}</td><td style="text-align:right;">$${(data.plasticas * 0.5).toFixed(2)}</td></tr>` : ''}${data.plegables > 0 ? `<tr><td>Sillas Plegables</td><td style="text-align:center;">${data.plegables}</td><td style="text-align:right;">$${(data.plegables * 1.0).toFixed(2)}</td></tr>` : ''}${data.cuadradas > 0 ? `<tr><td>Mesas Cuadradas</td><td style="text-align:center;">${data.cuadradas}</td><td style="text-align:right;">$${(data.cuadradas * 3.0).toFixed(2)}</td></tr>` : ''}${data.rectangular > 0 ? `<tr><td>Mesa Rectangular</td><td style="text-align:center;">${data.rectangular}</td><td style="text-align:right;">$${(data.rectangular * 6.0).toFixed(2)}</td></tr>` : ''}${data.transporte > 0 ? `<tr><td>Transporte</td><td style="text-align:center;">1</td><td style="text-align:right;">$${Number(data.transporte).toFixed(2)}</td></tr>` : ''}</tbody></table><div class="total">TOTAL A PAGAR: $${Number(data.total).toFixed(2)}</div><div class="notas"><b>TÉRMINOS Y CONDICIONES:</b><br>• Se requiere un abono del 50% para separar la fecha del evento.<br>• Cualquier daño al mobiliario o mantelería deberá ser cubierto por el cliente en su totalidad.</div><script>window.onload = function() { setTimeout(() => { window.print(); }, 800); };</script></body></html>`);
    ventana.document.close();
}

function iniciarVigilante() {
    setInterval(async () => {
        const { collection, getDocs, query, where } = window.firebaseMethods;
        const ahora = new Date();
        const fechaHoy = ahora.toISOString().split('T')[0];
        const snap = await getDocs(query(collection(window.db, "agenda"), where("fecha", "==", fechaHoy)));
        snap.forEach(doc => {
            const ev = doc.data();
            if (ev.hora) {
                const [h, m] = ev.hora.split(':');
                const horaEv = new Date(); horaEv.setHours(h, m, 0);
                const diff = Math.round((horaEv - ahora) / 60000);
                if (diff === 60) new Notification("🚚 MR ALQUILERES", { body: `Entrega en 1 hora: ${ev.cliente}`, icon: "logo.jpg" });
            }
        });
    }, 60000);
}

// ================== CARGA INICIAL Y STOCK VISIBLE ==================
// ================== CARGA INICIAL ==================
window.addEventListener('load', () => { 
    cargarListasCompartidas(); 
    iniciarVigilante();

    // Configurar fecha actual en el filtro
    const hoy = new Date();
    const fMes = document.getElementById("filtro-mes");
    if(fMes) fMes.value = hoy.toISOString().substring(0, 7);

    // --- NUEVO: INSERTAR ETIQUETAS AMARILLAS DEBAJO DE LOS INPUTS ---
    const items = ["plasticas", "plegables", "cuadradas", "rectangular"];
    
    items.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            // Buscamos si ya existe el letrero para no duplicarlo
            let etiqueta = document.getElementById(`info-${id}`);
            
            if (!etiqueta) {
                // Si no existe, lo creamos
                etiqueta = document.createElement("div");
                etiqueta.id = `info-${id}`;
                // Estilos para que se vea igual a la foto (amarillo y centrado)
                etiqueta.style.color = "#f39c12"; 
                etiqueta.style.fontSize = "12px";
                etiqueta.style.marginTop = "5px";
                etiqueta.style.textAlign = "center";
                etiqueta.style.fontWeight = "bold";
                
                // Lo insertamos justo después del input
                input.parentNode.insertBefore(etiqueta, input.nextSibling);
            }
            
            // Le ponemos el texto con el Precio y Stock actuales
            etiqueta.innerText = `$${PRECIOS[id].toFixed(2)} c/u | Stock: ${STOCK_MR[id]}`;
        }
    });
});