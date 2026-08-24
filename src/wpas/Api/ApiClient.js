/******************************************************************************
 * ApliClient.js
 * Cliente HTTP sin dependencias para el motor JScript de BlueZone.
 ******************************************************************************/

var ApiClient = {
    GetConfiguration: function () {
        var response = this.Request("GET", API.ConfigurationPath, null);
        if (!response.success) {
            Logger.Warn("No fue posible obtener configuracion del servidor.");
            return null;
        }
        return this.ParseJson(response.body);
    },

    GetReservations: function () {
        var response = this.Request("GET", API.ReservationsPath, null);
        if (!response.success) {
            Logger.Error("No fue posible obtener reservaciones desde la API.");
            return [];
        }
        var payload = this.ParseJson(response.body);
        if (!payload)
            return [];
        if (payload.reservations)
            return payload.reservations;
        if (payload.reservaciones)
            return payload.reservaciones;
        if (payload.length != null)
            return payload;
        return [];
    },

    SendResults: function (results, stats) {
        var payload = {
            worker: { name: WORKER.Name, version: WORKER.Version, environment: WORKER.Environment },
            stats: stats,
            results: results
        };
        var response = this.Request("POST", API.ResultsPath, this.Stringify(payload));
        if (!response.success) {
            Logger.Error("El servidor no acepto los resultados. HTTP " + response.status + ".");
            return false;
        }
        Logger.Info("Resultados enviados al servidor. HTTP " + response.status + ".");
        return true;
    },

    Request: function (method, path, body) {
        var result = { success: false, status: 0, body: "" };
        try {
            var http = new ActiveXObject("MSXML2.XMLHTTP.6.0");
            http.open(method, this.BuildUrl(path), false);
            http.setRequestHeader("Accept", "application/json");
            if (API.Token)
                http.setRequestHeader("Authorization", "Bearer " + API.Token);
            if (body != null)
                http.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
            http.send(body);
            result.status = http.status;
            result.body = http.responseText || "";
            result.success = http.status >= 200 && http.status < 300;
        }
        catch (e) {
            Logger.Error("Error HTTP: " + (e.message || e));
        }
        return result;
    },

    BuildUrl: function (path) {
        var base = API.BaseUrl.replace(/\/$/, "");
        if (!path)
            return base;
        if (path.charAt(0) != "/")
            path = "/" + path;
        return base + path;
    },

    ParseJson: function (text) {
        try {
            return eval("(" + text + ")");
        }
        catch (e) {
            Logger.Error("El servidor respondio JSON invalido.");
            return null;
        }
    },

    Stringify: function (value) {
        if (value == null)
            return "null";
        if (typeof value == "string")
            return "\"" + this.Escape(value) + "\"";
        if (typeof value == "number" || typeof value == "boolean")
            return value.toString();
        if (value.length != null && typeof value != "string") {
            var values = [];
            for (var i = 0; i < value.length; i++)
                values.push(this.Stringify(value[i]));
            return "[" + values.join(",") + "]";
        }
        var fields = [];
        for (var property in value) {
            if (typeof value[property] != "function" && typeof value[property] != "undefined")
                fields.push("\"" + this.Escape(property) + "\":" + this.Stringify(value[property]));
        }
        return "{" + fields.join(",") + "}";
    },

    Escape: function (value) {
        return value.toString().replace(/\\/g, "\\\\").replace(/\"/g, "\\\"").replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/\t/g, "\\t");
    }
};
