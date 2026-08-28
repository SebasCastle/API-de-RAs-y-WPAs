// ================================================================
// Script BlueZone -> Servidor Web
// ================================================================

// ================================================================
// Funciones de texto compatibles con BlueZone JScript
// ================================================================

function trim(texto) {
    if (texto == null) {
        return "";
    }
    while (texto.length > 0 && (texto.charAt(0) == " " || texto.charAt(0) == "\t")) {
        texto = texto.substring(1);
    }
    while (texto.length > 0 && (texto.charAt(texto.length - 1) == " " || texto.charAt(texto.length - 1) == "\t")) {
        texto = texto.substring(0, texto.length - 1);
    }
    return texto;
}

function split(texto, separador) {
    var resultado = [];
    var parte = "";
    var contador = 0;
    var i = 0;
    var j = 0;
    var coincide = false;

    if (texto == null) {
        return resultado;
    }
    if (separador == null || separador == "") {
        resultado[0] = texto;
        return resultado;
    }

    for (i = 0; i < texto.length; i++) {
        coincide = true;
        for (j = 0; j < separador.length; j++) {
            if (i + j >= texto.length || texto.charAt(i + j) != separador.charAt(j)) {
                coincide = false;
                break;
            }
        }
        if (coincide) {
            resultado[contador] = parte;
            contador++;
            parte = "";
            i = i + separador.length - 1;
        } else {
            parte += texto.charAt(i);
        }
    }
    resultado[contador] = parte;
    return resultado;
}

function splitLineas(texto) {
    var normalizado = texto.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    return split(normalizado, "\n");
}

function escaparJson(texto) {
    var valor = texto == null ? "" : texto.toString();
    var resultado = "";
    var i = 0;
    var c = "";

    for (i = 0; i < valor.length; i++) {
        c = valor.charAt(i);
        if (c == "\\") {
            resultado += "\\\\";
        } else if (c == "\"") {
            resultado += "\\\"";
        } else if (c == "\r") {
            resultado += "\\r";
        } else if (c == "\n") {
            resultado += "\\n";
        } else if (c == "\t") {
            resultado += "\\t";
        } else {
            resultado += c;
        }
    }
    return resultado;
}

function pad2(valor) {
    if (valor < 10) {
        return "0" + valor;
    }
    return valor.toString();
}

// ================================================================
// CONFIGURACION Y VARIABLES GLOBALES
// ================================================================

var host = new ActiveXObject("BZWhll.WhllObj");
var fs = new ActiveXObject("Scripting.FileSystemObject");

var ForReading = 1;
var ForWriting = 2;
var ForAppending = 8;

var CONFIG_PATH = "C:\\Users\\sebas\\OneDrive\\Documentos\\BlueZone\\Scripts\\config.env";
var LOG_PATH = "C:\\Users\\sebas\\OneDrive\\Documentos\\BlueZone\\Scripts\\app.log";
var archivoPath = "D:\\Downloads\\lista_reservaciones.txt";

// "FILE" para leer txt local, "HTTP" para obtener reservaciones del servidor
var RESERVATIONS_SOURCE = "FILE";
var API_BASE_URL = "http://localhost:3000";
var RESERVATIONS_HTTP_URL = "http://localhost:3000/wpa/jobs/REEMPLAZAR_JOB_ID/reservations";
var API_SYNC_URL = "";
var WORKER_ID = "BLUEZONE-01";
var currentJobId = "";

var ESPERA_CORTA = 1;
var ESPERA_LARGA = 2;

var USER = "";
var PASSWORD = "";

var totalLineasProcesadas = 0;
var totalCorrectos = 0;
var totalNoEncontrados = 0;
var totalConError = 0;
var primeraVez = true;

var datosParaEnviar = [];
var procesoStatus = "success";
var procesoMensaje = "";
var procesoErrorCode = 0;

// Codigos de error para el servidor
var ERROR_OK = 0;
var ERROR_CONFIG = 1;
var ERROR_CONEXION = 2;
var ERROR_LOGIN = 3;
var ERROR_PASSWORD = 4;
var ERROR_MENU = 5;
var ERROR_RESERVACIONES = 6;
var ERROR_PROCESO = 7;
var ERROR_SYNC = 8;
var ERROR_CRITICO = 999;

// ================================================================
// Logger - escribe en app.log (crea o agrega historial)
// Uso: FileLogger.success("mensaje"), FileLogger.error("mensaje")
// ================================================================

var FileLogger = {
    rutaLog: LOG_PATH,
    fso: null,

    init: function () {
        this.fso = fs;
    },

    timestamp: function () {
        var ahora = new Date();
        return ahora.getFullYear() + "-" +
            pad2(ahora.getMonth() + 1) + "-" +
            pad2(ahora.getDate()) + " " +
            pad2(ahora.getHours()) + ":" +
            pad2(ahora.getMinutes()) + ":" +
            pad2(ahora.getSeconds());
    },

    escribir: function (nivel, mensaje) {
        var linea = "";
        var archivo = null;

        try {
            if (this.fso == null) {
                this.init();
            }

            linea = this.timestamp() + " [" + nivel + "] " + mensaje;

            if (this.fso.FileExists(this.rutaLog)) {
                archivo = this.fso.OpenTextFile(this.rutaLog, ForAppending, true);
            } else {
                archivo = this.fso.CreateTextFile(this.rutaLog, true);
            }

            archivo.WriteLine(linea);
            archivo.Close();
        } catch (e) {
            // No detener el proceso por fallo de log
        }
    },

    info: function (mensaje) {
        this.escribir("INFO", mensaje);
    },

    success: function (mensaje) {
        this.escribir("SUCCESS", mensaje);
    },

    error: function (mensaje) {
        this.escribir("ERROR", mensaje);
    }
};

// ================================================================
// MAIN
// ================================================================

function main() {
    FileLogger.init();
    FileLogger.info("==================================================");
    FileLogger.info("Inicio del proceso BlueZone -> Servidor");

    try {
        if (!tomarSiguienteJob()) {
            FileLogger.info("No hay jobs pendientes. El worker volvera a consultar en el siguiente ciclo.");
            return;
        }

        if (!conectarTerminal()) {
            finalizarConError("No fue posible conectar a la terminal BlueZone.", ERROR_CONEXION);
            return;
        }

        if (!getCredentialsFromConfigFile()) {
            finalizarConError("No fue posible obtener credenciales desde config.env.", ERROR_CONFIG);
            return;
        }

        if (!login()) {
            finalizarConError("No fue posible iniciar sesion en BlueZone.", ERROR_LOGIN);
            return;
        }

        if (leerPantalla("PASSWORD EXPIRED")) {
            FileLogger.info("Contraseña expirada detectada. Iniciando cambio.");
            if (!cambiarPasswordExpirada()) {
                finalizarConError("No fue posible cambiar la contraseña expirada.", ERROR_PASSWORD);
                return;
            }

            if (!login()) {
                finalizarConError("No fue posible iniciar sesion despues del cambio de contraseña.", ERROR_LOGIN);
                return;
            }
        }

        if (!irAlMenuPrincipal()) {
            finalizarConError("No fue posible llegar al menu principal.", ERROR_MENU);
            return;
        }

        if (!leerPantalla("TRANSACTION MENU")) {
            finalizarConError("No se detecto TRANSACTION MENU despues del login.", ERROR_MENU);
            return;
        }

        FileLogger.success("Sesion iniciada y menu TRANSACTION MENU verificado.");

        var listaReservaciones = obtenerReservaciones();
        if (!listaReservaciones || listaReservaciones.length == 0) {
            finalizarConError("No se encontraron reservaciones para procesar.", ERROR_RESERVACIONES);
            return;
        }

        FileLogger.info("Reservaciones a procesar: " + listaReservaciones.length);

        if (!reservations(listaReservaciones)) {
            finalizarConError(procesoMensaje || "Error durante el procesamiento de reservaciones.", ERROR_PROCESO);
            return;
        }

        procesoStatus = "success";
        procesoMensaje = "Proceso completado correctamente.";
        procesoErrorCode = ERROR_OK;

        FileLogger.success("Proceso completado. Correctos=" + totalCorrectos +
            ", NoEncontrados=" + totalNoEncontrados + ", Errores=" + totalConError);

        enviarDatos(procesoMensaje, procesoStatus, procesoErrorCode);

    } catch (e) {
        var msgError = e.message ? e.message : e.toString();
        FileLogger.error("Error no controlado en main: " + msgError);
        enviarDatos("Error no controlado: " + msgError, "error", ERROR_CRITICO);
    } finally {
        terminarSesion();
        FileLogger.info("Proceso finalizado.");
        FileLogger.info("==================================================");
    }
}

// ================================================================
// Worker / Jobs. Estas funciones usan solamente JScript clasico.
// El BAT las ejecuta repetidamente; Nest no ejecuta ningun BAT.
// ================================================================

function solicitarHttp(metodo, url, cuerpo) {
    var respuesta = { ok: false, status: 0, text: "" };
    var http = null;
    try {
        http = new ActiveXObject("MSXML2.XMLHTTP.6.0");
        http.open(metodo, url, false);
        http.setRequestHeader("Accept", "application/json");
        if (cuerpo != null) {
            http.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
        }
        http.send(cuerpo);
        respuesta.status = http.status;
        respuesta.text = http.responseText ? http.responseText : "";
        respuesta.ok = http.status >= 200 && http.status < 300;
    } catch (e) {
        FileLogger.error("Error HTTP worker: " + (e.message ? e.message : e));
    }
    return respuesta;
}

function parsearJson(texto) {
    try {
        return eval("(" + texto + ")");
    } catch (e) {
        FileLogger.error("Respuesta JSON invalida del servidor.");
        return null;
    }
}

function enviarHeartbeat(estado) {
    var cuerpo = "{\"workerId\":\"" + escaparJson(WORKER_ID) + "\",\"status\":\"" + escaparJson(estado) + "\"}";
    var respuesta = solicitarHttp("POST", API_BASE_URL + "/wpa/worker/heartbeat", cuerpo);
    if (!respuesta.ok) {
        FileLogger.error("Heartbeat rechazado. HTTP " + respuesta.status);
    }
    return respuesta.ok;
}

function tomarSiguienteJob() {
    var respuesta = null;
    var job = null;

    enviarHeartbeat("ONLINE");
    respuesta = solicitarHttp("GET", API_BASE_URL + "/wpa/worker/jobs/next?workerId=" + WORKER_ID, null);
    if (!respuesta.ok) {
        FileLogger.error("No se pudo consultar el siguiente job. HTTP " + respuesta.status);
        return false;
    }
    if (respuesta.text == "" || respuesta.text == "null") {
        return false;
    }
    job = parsearJson(respuesta.text);
    if (job == null) {
        return false;
    }
    currentJobId = job._id ? job._id : job.id;
    if (currentJobId == null || currentJobId == "") {
        FileLogger.error("El servidor devolvio un job sin identificador.");
        return false;
    }
    RESERVATIONS_SOURCE = job.source ? job.source : "FILE";
    RESERVATIONS_HTTP_URL = API_BASE_URL + "/wpa/jobs/" + currentJobId + "/reservations";
    API_SYNC_URL = API_BASE_URL + "/wpa/jobs/" + currentJobId + "/sync";
    FileLogger.info("Job reclamado: " + currentJobId + ", fuente=" + RESERVATIONS_SOURCE);
    return true;
}

function finalizarConError(mensaje, codigo) {
    procesoStatus = "error";
    procesoMensaje = mensaje;
    procesoErrorCode = codigo;
    FileLogger.error(mensaje);
    enviarDatos(mensaje, "error", codigo);
}

// ================================================================
// Conexion y sesion
// ================================================================

function conectarTerminal() {
    var resultado = host.Connect("A");
    if (resultado != 0) {
        host.Connect("");
    }
    FileLogger.info("Conexion a terminal BlueZone establecida.");
    return true;
}

function terminarSesion() {
    try {
        host.SendKey("<PF3>");
        host.Wait(ESPERA_CORTA);
        host.Disconnect();
        FileLogger.info("Sesion BlueZone finalizada.");
    } catch (e) {
        FileLogger.error("Error al finalizar sesion: " + (e.message ? e.message : e));
    }
}

// ================================================================
// Credenciales desde config.env
// ================================================================

function leerArchivoConfig(path) {
    var credenciales = {};
    var archivo = null;
    var linea = "";
    var partes = [];
    var clave = "";
    var valor = "";
    var i = 0;

    archivo = fs.OpenTextFile(path, ForReading);
    while (!archivo.AtEndOfStream) {
        linea = trim(archivo.ReadLine());
        if (linea.length == 0) {
            continue;
        }
        if (linea.charAt(0) == "#") {
            continue;
        }

        partes = split(linea, "=");
        if (partes.length >= 2) {
            clave = trim(partes[0]);
            valor = trim(partes[1]);
            for (i = 2; i < partes.length; i++) {
                valor = valor + "=" + partes[i];
            }
            credenciales[clave] = valor;
        }
    }
    archivo.Close();
    return credenciales;
}

function guardarPasswordEnConfig(nuevaPassword) {
    var archivo = null;
    var lineas = [];
    var linea = "";
    var partes = [];
    var i = 0;
    var encontrado = false;
    var contenido = "";

    archivo = fs.OpenTextFile(CONFIG_PATH, ForReading);
    while (!archivo.AtEndOfStream) {
        lineas.push(archivo.ReadLine());
    }
    archivo.Close();

    for (i = 0; i < lineas.length; i++) {
        linea = lineas[i];
        partes = split(trim(linea), "=");
        if (partes.length >= 2 && trim(partes[0]) == "PASSWORD") {
            lineas[i] = "PASSWORD=" + nuevaPassword;
            encontrado = true;
        }
    }

    if (!encontrado) {
        lineas.push("PASSWORD=" + nuevaPassword);
    }

    for (i = 0; i < lineas.length; i++) {
        if (i > 0) {
            contenido += "\r\n";
        }
        contenido += lineas[i];
    }

    archivo = fs.CreateTextFile(CONFIG_PATH, true);
    archivo.Write(contenido);
    archivo.Close();
}

function incrementarPassword(passwordActual) {
    var i = 0;
    var numero = "";
    var prefijo = "";
    var digito = "";

    for (i = passwordActual.length - 1; i >= 0; i--) {
        digito = passwordActual.charAt(i);
        if (digito >= "0" && digito <= "9") {
            numero = digito + numero;
        } else {
            prefijo = passwordActual.substring(0, i + 1);
            break;
        }
    }

    if (numero.length == 0) {
        return passwordActual;
    }

    return prefijo + (parseInt(numero, 10) + 1).toString();
}

function getCredentialsFromConfigFile(modo) {
    var credenciales = null;

    if (!fs.FileExists(CONFIG_PATH)) {
        FileLogger.error("Archivo de configuracion no encontrado: " + CONFIG_PATH);
        return false;
    }

    credenciales = leerArchivoConfig(CONFIG_PATH);

    if (modo == 1) {
        return credenciales;
    }

    USER = credenciales.USERNAME ? credenciales.USERNAME : "";
    PASSWORD = credenciales.PASSWORD ? credenciales.PASSWORD : "";

    if (USER == "" || PASSWORD == "") {
        FileLogger.error("USERNAME o PASSWORD vacios en config.env.");
        return false;
    }

    FileLogger.success("Credenciales cargadas para usuario: " + USER);
    return true;
}

function cambiarPasswordExpirada() {
    var nuevaPassword = incrementarPassword(PASSWORD);

    host.Wait(ESPERA_LARGA);

    host.SendKey(USER);
    host.SendKey(PASSWORD);
    host.SendKey(nuevaPassword);
    host.SendKey("@E");
    host.Wait(ESPERA_LARGA);

    if (!leerPantalla("PLEASE RE-ENTER NEW PASSWORD")) {
        FileLogger.error("No se detecto confirmacion de nueva contraseña.");
        return false;
    }

    host.SendKey(nuevaPassword);
    host.SendKey("@E");
    host.Wait(ESPERA_LARGA);

    if (!leerPantalla("PWD-CHG")) {
        FileLogger.error("BlueZone no confirmo el cambio de contraseña.");
        return false;
    }

    host.SendKey("@E");
    host.Wait(ESPERA_LARGA);

    guardarPasswordEnConfig(nuevaPassword);
    PASSWORD = nuevaPassword;

    FileLogger.success("Contraseña actualizada correctamente en config.env.");
    return true;
}

// ================================================================
// Login y navegacion
// ================================================================

function login() {
    host.SendKey("ims");
    host.SendKey("@E");
    host.Wait(ESPERA_CORTA);

    host.SendKey(USER);
    host.Wait(ESPERA_CORTA);

    host.SendKey(PASSWORD);
    host.SendKey("@E");
    host.Wait(ESPERA_LARGA);

    if (leerPantalla("NOT AUTHORIZED") ||
        leerPantalla("INVALID PASSWORD") ||
        leerPantalla("REVOKED")) {
        FileLogger.error("BlueZone rechazo las credenciales.");
        return false;
    }

    FileLogger.success("Login enviado correctamente.");
    return true;
}

function irAlMenuPrincipal() {
    host.SendKey("/for pmenu");
    host.SendKey("@E");
    host.Wait(ESPERA_LARGA);
    return leerPantalla("TRANSACTION MENU");
}

function irPantalla502() {
    host.SendKey("502");
    host.SendKey("@E");
    host.Wait(ESPERA_LARGA);
}

function ReiniciarCicloNavegacion() {
    host.SendKey("<PF12>");
    host.Wait(ESPERA_CORTA);

    if (!leerPantalla("TRANSACTION MENU")) {
        FileLogger.error("No se detecto TRANSACTION MENU al reiniciar ciclo.");
        return false;
    }

    irPantalla502();
    return leerPantalla("502");
}

function leerPantalla(texto) {
    var buf = new Object();
    var contenidoFila = "";
    var fila = 0;
    var textoBuscar = texto.toUpperCase();

    for (fila = 1; fila <= 24; fila++) {
        buf.Str = "";
        host.ReadScreen(buf, 80, fila, 1);
        contenidoFila = buf.Str.toUpperCase();
        if (contenidoFila.indexOf(textoBuscar) > -1) {
            return true;
        }
    }
    return false;
}

function PantallaContiene(textoBuscar) {
    return leerPantalla(textoBuscar);
}

// ================================================================
// Reservaciones: archivo txt o HTTP
// ================================================================

function obtenerReservaciones() {
    if (RESERVATIONS_SOURCE == "HTTP") {
        return obtenerReservacionesHttp();
    }
    return obtenerReservacionesArchivo();
}

function obtenerReservacionesArchivo() {
    var reservaciones = [];
    var archivo = null;
    var linea = "";

    if (!fs.FileExists(archivoPath)) {
        FileLogger.error("Archivo de reservaciones no encontrado: " + archivoPath);
        return reservaciones;
    }

    archivo = fs.OpenTextFile(archivoPath, ForReading);
    while (!archivo.AtEndOfStream) {
        linea = trim(archivo.ReadLine());
        if (linea.length > 0) {
            reservaciones.push(linea);
        }
    }
    archivo.Close();

    FileLogger.info("Reservaciones cargadas desde archivo: " + reservaciones.length);
    return reservaciones;
}

function obtenerReservacionesHttp() {
    var reservaciones = [];
    var http = null;
    var cuerpo = "";
    var lineas = [];
    var i = 0;
    var linea = "";

    try {
        http = new ActiveXObject("MSXML2.XMLHTTP.6.0");
        http.open("GET", RESERVATIONS_HTTP_URL, false);
        http.setRequestHeader("Accept", "text/plain, application/json");
        http.send();

        if (http.status < 200 || http.status >= 300) {
            FileLogger.error("HTTP reservaciones fallo. Status=" + http.status);
            return reservaciones;
        }

        cuerpo = http.responseText ? http.responseText : "";

        // Intentar JSON simple: {"reservaciones":["22974515MX4","23175201US0"]}
        if (cuerpo.indexOf("[") > -1 && cuerpo.indexOf("]") > -1) {
            reservaciones = parsearReservacionesJson(cuerpo);
            if (reservaciones.length > 0) {
                FileLogger.info("Reservaciones cargadas via HTTP (JSON): " + reservaciones.length);
                return reservaciones;
            }
        }

        lineas = splitLineas(cuerpo);
        for (i = 0; i < lineas.length; i++) {
            linea = trim(lineas[i]);
            if (linea.length > 0) {
                reservaciones.push(linea);
            }
        }

        FileLogger.info("Reservaciones cargadas via HTTP (texto): " + reservaciones.length);
    } catch (e) {
        FileLogger.error("Error obteniendo reservaciones HTTP: " + (e.message ? e.message : e));
    }

    return reservaciones;
}

function parsearReservacionesJson(texto) {
    var reservaciones = [];
    var inicio = 0;
    var fin = 0;
    var bloque = "";
    var partes = [];
    var valor = "";
    var i = 0;

    inicio = texto.indexOf("[");
    fin = texto.lastIndexOf("]");
    if (inicio < 0 || fin <= inicio) {
        return reservaciones;
    }

    bloque = texto.substring(inicio + 1, fin);
    partes = split(bloque, ",");
    for (i = 0; i < partes.length; i++) {
        valor = trim(partes[i]);
        valor = valor.replace(/\"/g, "");
        valor = trim(valor);
        if (valor.length > 0) {
            reservaciones.push(valor);
        }
    }

    return reservaciones;
}

// ================================================================
// Procesamiento de reservaciones
// ================================================================

function reservations(listaReservaciones) {
    var i = 0;
    var reserva = "";
    var resultado = "";

    datosParaEnviar = [];
    totalLineasProcesadas = 0;
    totalCorrectos = 0;
    totalNoEncontrados = 0;
    totalConError = 0;
    primeraVez = true;

    irPantalla502();
    if (!leerPantalla("502")) {
        FileLogger.error("No se pudo abrir la pantalla 502.");
        procesoMensaje = "No se pudo abrir la pantalla 502.";
        return false;
    }

    for (i = 0; i < listaReservaciones.length; i++) {
        reserva = trim(listaReservaciones[i]);
        if (reserva.length == 0) {
            continue;
        }

        totalLineasProcesadas++;
        FileLogger.info("Procesando reservacion: " + reserva);

        resultado = ProcesarReserva(reserva);

        if (resultado == "NOT_FOUND") {
            totalNoEncontrados++;
            datosParaEnviar.push({
                reservacion: reserva,
                wpa: "",
                status: "NOT_FOUND"
            });
            FileLogger.error("Reservacion no encontrada: " + reserva);
        } else if (resultado == "ERR") {
            totalConError++;
            datosParaEnviar.push({
                reservacion: reserva,
                wpa: "",
                status: "ERR"
            });
            FileLogger.error("Error procesando reservacion: " + reserva);
        } else {
            totalCorrectos++;
            datosParaEnviar.push({
                reservacion: reserva,
                wpa: resultado,
                status: "OK"
            });
            FileLogger.success("Reservacion OK: " + reserva + " WPA=" + resultado);
        }

        if (i < listaReservaciones.length - 1) {
            if (!ReiniciarCicloNavegacion()) {
                procesoMensaje = "No se pudo regresar al menu para continuar reservaciones.";
                FileLogger.error(procesoMensaje);
                return false;
            }
        }

        primeraVez = false;
    }

    return true;
}

function ProcesarReserva(reserva) {
    var intentos = 0;
    var maxIntentos = 2;
    var i = 0;

    while (intentos < maxIntentos) {
        intentos++;

        host.Wait(ESPERA_CORTA);
        host.SendKey("dr");
        host.Wait(ESPERA_CORTA);

        for (i = 0; i <= 18; i++) {
            host.SendKey("@T");
        }

        host.SendKey("r/" + reserva);
        host.SendKey("@E");
        host.Wait(ESPERA_LARGA);

        if (pantallaReservacionNoEncontrada()) {
            return "NOT_FOUND";
        }

        if (VerificarErrorPantalla()) {
            host.SendKey("<PF12>");
            host.Wait(ESPERA_CORTA);
            host.SendKey("502");
            host.SendKey("@E");
            host.Wait(ESPERA_CORTA);

            if (intentos >= maxIntentos) {
                return "ERR";
            }
        } else {
            return ExtraerWPA();
        }
    }

    return "ERR";
}

function VerificarErrorPantalla() {
    return leerPantalla("ERROR - SEE HIGHLIGHTED FIELDS") ||
        leerPantalla("INVALID") ||
        leerPantalla("NOT AUTHORIZED");
}

function pantallaReservacionNoEncontrada() {
    return leerPantalla("RESERVATION NOT FOUND") ||
        leerPantalla("NOT FOUND") ||
        leerPantalla("NO RECORD");
}

function ExtraerWPA() {
    var etiqueta = "WPA";
    var buf = new Object();
    var bufWpa = new Object();
    var contenidoFila = "";
    var posicion = 0;
    var colLectura = 0;
    var valorCrudo = "";
    var valorLimpio = "";
    var valor4digitos = "";
    var fila = 0;
    var esponBuffer = new Object();

    for (fila = 1; fila <= 24; fila++) {
        buf.Str = "";
        host.ReadScreen(buf, 80, fila, 1);
        contenidoFila = buf.Str;
        posicion = contenidoFila.indexOf(etiqueta);

        if (posicion > -1) {
            colLectura = posicion + 1 + 3;
            bufWpa.Str = "";
            host.ReadScreen(bufWpa, 6, fila, colLectura);
            valorCrudo = bufWpa.Str;
            valorLimpio = trim(valorCrudo);

            if (valorLimpio == "" || valorLimpio == " ") {
                return "0000";
            }

            valor4digitos = valorLimpio.substring(0, 4);
            return EstandarizarValor(valor4digitos);
        }
    }

    // Fallback posicion fija usada en scripts previos
    bufWpa.Str = "";
    host.ReadScreen(bufWpa, 4, 12, 21);
    if (!esVacioOConEspacios(bufWpa.Str)) {
        return EstandarizarValor(trim(bufWpa.Str).substring(0, 4));
    }

    // Manejo ESPON
    esponBuffer.Str = "";
    host.ReadScreen(esponBuffer, 5, 24, 21);
    if (trim(esponBuffer.Str) == "ESPON") {
        host.SendKey("@E");
        for (fila = 0; fila < 16; fila++) {
            host.SendKey("@T");
        }
        bufWpa.Str = "";
        host.ReadScreen(bufWpa, 4, 12, 21);
        if (!esVacioOConEspacios(bufWpa.Str)) {
            return EstandarizarValor(trim(bufWpa.Str).substring(0, 4));
        }
    }

    return "0000";
}

function EstandarizarValor(valor) {
    var resultado = "";
    var i = 0;
    var caracter = "";

    for (i = 0; i < valor.length; i++) {
        caracter = valor.charAt(i).toUpperCase();
        if (caracter == "A") {
            resultado += "4";
        } else if (caracter == "Y") {
            resultado += "1";
        } else if (caracter == "M") {
            resultado += "2";
        } else if (caracter == "X" || caracter == "N") {
            resultado += "0";
        } else if (caracter == "0" || caracter == "1" || caracter == "2") {
            resultado += caracter;
        } else {
            resultado += caracter;
        }
    }

    return resultado;
}

function esVacioOConEspacios(str) {
    var i = 0;
    if (str == null) {
        return true;
    }
    for (i = 0; i < str.length; i++) {
        if (str.charCodeAt(i) != 32) {
            return false;
        }
    }
    return true;
}

function sendKeyMultiple(key, count) {
    var i = 0;
    for (i = 0; i < count; i++) {
        host.SendKey(key);
    }
}

// ================================================================
// Enviar datos al servidor (exito o error)
// ================================================================

function enviarDatos(mensaje, status, codigoError) {
    var jsonString = "";
    var http = null;
    var msg = mensaje ? mensaje : "";
    var st = status ? status : procesoStatus;
    var code = codigoError != null ? codigoError : procesoErrorCode;
    var i = 0;

    try {
        if (API_SYNC_URL == "") {
            FileLogger.error("No existe job activo; no se enviaran resultados.");
            return;
        }
        jsonString = "{";
        jsonString += "\"status\":\"" + escaparJson(st) + "\",";
        jsonString += "\"errorCode\":" + code + ",";
        jsonString += "\"message\":\"" + escaparJson(msg) + "\",";
        jsonString += "\"stats\":{";
        jsonString += "\"total\":" + totalLineasProcesadas + ",";
        jsonString += "\"correctos\":" + totalCorrectos + ",";
        jsonString += "\"noEncontrados\":" + totalNoEncontrados + ",";
        jsonString += "\"errores\":" + totalConError;
        jsonString += "},";
        jsonString += "\"results\":[";

        for (i = 0; i < datosParaEnviar.length; i++) {
            jsonString += "{";
            jsonString += "\"reservacion\":\"" + escaparJson(datosParaEnviar[i].reservacion) + "\",";
            jsonString += "\"wpa\":\"" + escaparJson(datosParaEnviar[i].wpa) + "\",";
            jsonString += "\"status\":\"" + escaparJson(datosParaEnviar[i].status) + "\"";
            jsonString += "}";
            if (i < datosParaEnviar.length - 1) {
                jsonString += ",";
            }
        }

        jsonString += "]}";

        http = new ActiveXObject("MSXML2.XMLHTTP.6.0");
        http.open("POST", API_SYNC_URL, false);
        http.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
        http.send(jsonString);

        if (http.status >= 200 && http.status < 300) {
            FileLogger.success("Datos enviados al servidor. HTTP " + http.status + ". Status=" + st);
        } else {
            FileLogger.error("Error al sincronizar. HTTP " + http.status + ". " + http.responseText);
        }
    } catch (e) {
        FileLogger.error("Error critico al enviar datos HTTP: " + (e.message ? e.message : e));
    }
}

main();
