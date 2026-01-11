// ================== CONFIGURACIÓN DE STOCK Y PRECIOS ==================
const PRECIOS = { plasticas: 0.5, plegables: 1.0, cuadradas: 3.0, rectangular: 6.0 };
const STOCK_MR = { plasticas: 70, plegables: 60, cuadradas: 15, rectangular: 1 };

let actual = { cliente: "", direccion: "", fecha: "", plasticas: 0, plegables: 0, cuadradas: 0, rectangular: 0, transporte: 0, total: 0 };

function cambiarVista(v) {
  document.querySelectorAll(".vista").forEach(e => e.style.display = "none");
  document.getElementById(v).style.display = "block";
  if (v === "vista-cotizaciones") cargarCotizaciones();
  if (v === "vista-agenda") cargarAgenda();
}

function cotizar() {
  const fechaSel = document.getElementById("fecha").value;
  const cPla = +document.getElementById("plasticas").value || 0;
  const cPle = +document.getElementById("plegables").value || 0;
  const cCua = +document.getElementById("cuadradas").value || 0;
  const cRec = +document.getElementById("rectangular").value || 0;
  const cTra = +document.getElementById("transporte").value || 0;

  if (fechaSel) {
    let ocupado = { plasticas: 0, plegables: 0, cuadradas: 0, rectangular: 0 };
    let todas = [...(JSON.parse(localStorage.getItem("cotizaciones")) || []), 
                 ...(JSON.parse(localStorage.getItem("agenda")) || [])];

    todas.forEach(reg => {
      if (reg.fecha === fechaSel) {
        ocupado.plasticas += (Number(reg.plasticas) || 0);
        ocupado.plegables += (Number(reg.plegables) || 0);
        ocupado.cuadradas += (Number(reg.cuadradas) || 0);
        ocupado.rectangular += (Number(reg.rectangular) || 0);
      }
    });

    if (cPla > (STOCK_MR.plasticas - ocupado.plasticas)) { alert(`⚠️ Solo quedan ${STOCK_MR.plasticas - ocupado.plasticas} sillas plásticas.`); return; }
    if (cPle > (STOCK_MR.plegables - ocupado.plegables)) { alert(`⚠️ Solo quedan ${STOCK_MR.plegables - ocupado.plegables} sillas plegables.`); return; }
    if (cCua > (STOCK_MR.cuadradas - ocupado.cuadradas)) { alert(`⚠️ Solo quedan ${STOCK_MR.cuadradas - ocupado.cuadradas} mesas cuadradas.`); return; }
    if (cRec > (STOCK_MR.rectangular - ocupado.rectangular)) { alert(`⚠️ Mesa rectangular ocupada.`); return; }
  }

  actual = { cliente: document.getElementById("cliente").value, direccion: document.getElementById("direccion").value, fecha: fechaSel, plasticas: cPla, plegables: cPle, cuadradas: cCua, rectangular: cRec, transporte: cTra };
  actual.total = (actual.plasticas * PRECIOS.plasticas) + (actual.plegables * PRECIOS.plegables) + (actual.cuadradas * PRECIOS.cuadradas) + (actual.rectangular * PRECIOS.rectangular) + actual.transporte;
  document.getElementById("total").innerText = `$${actual.total.toFixed(2)}`;
}

// CAMBIO AQUÍ: Se añade el folio secuencial permanente
function guardarCotizacion() {
  if (!actual.cliente || actual.total <= 0) return alert("Completa los datos");
  
  let ultimoFolio = parseInt(localStorage.getItem("ultimoFolio")) || 0;
  let nuevoFolio = ultimoFolio + 1;
  let folioTexto = nuevoFolio.toString().padStart(3, '0');

  let c = JSON.parse(localStorage.getItem("cotizaciones")) || [];
  c.push({ ...actual, id: Date.now(), folio: folioTexto });
  
  localStorage.setItem("ultimoFolio", nuevoFolio);
  localStorage.setItem("cotizaciones", JSON.stringify(c));
  
  alert(`Cotización Guardada ✔ N°: ${folioTexto}`);
  location.reload(); 
}

function cargarCotizaciones() {
  let c = JSON.parse(localStorage.getItem("cotizaciones")) || [];
  let html = "";
  c.forEach((x, i) => {
    html += `<div class="item-lista"><h3>${x.cliente}</h3><div class="info-grid">📍 ${x.direccion}<br>📅 ${x.fecha}<br><b>Total: $${x.total.toFixed(2)}</b></div>
      <div class="acciones"><button class="btn-pdf" onclick="descargarPDF(${i}, 'cotizaciones')">📄 PDF</button>
      <button class="btn-confirmar" onclick="confirmar(${i})">✅ Agendar</button>
      <button class="btn-borrar" onclick="borrar(${i}, 'cotizaciones')">🗑</button></div></div>`;
  });
  document.getElementById("lista-cotizaciones").innerHTML = html || "<p>No hay presupuestos</p>";
}

function cargarAgenda() {
  let a = JSON.parse(localStorage.getItem("agenda")) || [];
  let html = "";
  a.forEach((x, i) => {
    html += `<div class="item-lista" style="border-left: 5px solid #2ecc71">
      <h3>${x.cliente.toUpperCase()}</h3>
      <div class="info-grid">📅 ${x.fecha} | 📍 ${x.direccion}<br>
      <small>🪑 ${x.plasticas} P | 🪑 ${x.plegables} Pl | 🔲 ${x.cuadradas} M | 🚚 $${x.transporte}</small><br>
      <b>Total: $${x.total.toFixed(2)}</b></div>
      <div class="acciones"><button class="btn-pdf" onclick="descargarPDF(${i}, 'agenda')">📄 PDF</button>
      <button class="btn-borrar" onclick="borrar(${i}, 'agenda')">🗑</button></div></div>`;
  });
  document.getElementById("lista-agenda").innerHTML = html || "<p>Agenda vacía</p>";
}

function confirmar(i) {
  let c = JSON.parse(localStorage.getItem("cotizaciones")) || [];
  let a = JSON.parse(localStorage.getItem("agenda")) || [];
  a.push(c[i]);
  c.splice(i, 1);
  localStorage.setItem("cotizaciones", JSON.stringify(c));
  localStorage.setItem("agenda", JSON.stringify(a));
  cargarCotizaciones();
}

function borrar(i, tipo) {
  if(!confirm("¿Eliminar?")) return;
  let d = JSON.parse(localStorage.getItem(tipo));
  d.splice(i, 1);
  localStorage.setItem(tipo, JSON.stringify(d));
  location.reload();
}

// CAMBIO AQUÍ: Se agregaron ambas fechas con el mismo formato
function descargarPDF(i, tipo) {
  let lista = JSON.parse(localStorage.getItem(tipo)) || [];
  let data = lista[i];
  
  let nFactura = data.folio ? data.folio : (i + 1).toString().padStart(3, '0');
  
  // Formateo de fechas: misma lógica para ambas
  const hoy = new Date();
  const fechaEmision = hoy.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  
  // Convertimos la fecha del evento (YYYY-MM-DD) al formato DD/MM/YYYY
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
          <img src="logo.jpg" class="logo" onload="window.logoLoaded=true">
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
            <th style="text-align:right;">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${data.plasticas > 0 ? `<tr><td>Sillas Plásticas</td><td style="text-align:center;">${data.plasticas}</td><td style="text-align:right;">$${(data.plasticas * 0.5).toFixed(2)}</td></tr>` : ''}
          ${data.plegables > 0 ? `<tr><td>Sillas Plegables</td><td style="text-align:center;">${data.plegables}</td><td style="text-align:right;">$${(data.plegables * 1.0).toFixed(2)}</td></tr>` : ''}
          ${data.cuadradas > 0 ? `<tr><td>Mesas Cuadradas</td><td style="text-align:center;">${data.cuadradas}</td><td style="text-align:right;">$${(data.cuadradas * 3.0).toFixed(2)}</td></tr>` : ''}
          ${data.rectangular > 0 ? `<tr><td>Mesa Rectangular</td><td style="text-align:center;">${data.rectangular}</td><td style="text-align:right;">$${(data.rectangular * 6.0).toFixed(2)}</td></tr>` : ''}
          ${data.transporte > 0 ? `<tr><td>Transporte</td><td style="text-align:center;">1</td><td style="text-align:right;">$${data.transporte.toFixed(2)}</td></tr>` : ''}
        </tbody>
      </table>

      <div class="total">TOTAL A PAGAR: $${data.total.toFixed(2)}</div>

      <div class="notas">
        <b>TÉRMINOS Y CONDICIONES:</b><br>
        • Se requiere un abono del 50% para separar la fecha del evento.<br>
        • Cualquier daño al mobiliario o mantelería deberá ser cubierto por el cliente en su totalidad.
      </div>

      <script>
        window.onload = function() {
          setTimeout(() => {
            window.print();
          }, 800); 
        };
      </script>
    </body>
    </html>
  `);
  ventana.document.close();
}

// ================== NOTIFICACIONES AUTOMÁTICAS ==================
function revisarRecordatorios() {
  const agenda = JSON.parse(localStorage.getItem("agenda")) || [];
  const hoy = new Date().toISOString().split('T')[0];
  
  agenda.forEach(evento => {
    if (evento.fecha === hoy) {
      alert(`📢 ¡RECORDATORIO DE EVENTO HOY! \nCliente: ${evento.cliente.toUpperCase()} \nDirección: ${evento.direccion}`);
    }
  });
}

window.onload = function() {
  revisarRecordatorios();
  if (typeof cargarCotizaciones === 'function') cargarCotizaciones();
};