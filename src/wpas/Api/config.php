<?php
/**
 * Configuracion compartida del bot Avis / BlueZone.
 * Copiar esta carpeta a la raiz del servidor web (ej. htdocs/Avis_bot).
 */

define('AVIS_BOT_ROOT', __DIR__);
define('AVIS_BOT_DATA', AVIS_BOT_ROOT . DIRECTORY_SEPARATOR . 'data');
define('AVIS_BOT_LOG', AVIS_BOT_DATA . DIRECTORY_SEPARATOR . 'sync.log');
define('AVIS_BOT_RESULTS', AVIS_BOT_DATA . DIRECTORY_SEPARATOR . 'ultimo_resultado.json');
define('AVIS_BOT_RESERVATIONS_FILE', AVIS_BOT_DATA . DIRECTORY_SEPARATOR . 'reservaciones.txt');

/**
 * Codigos de error enviados por Script_Bluezone_a_Web (server).js
 */
function avis_bot_error_messages()
{
    return array(
        0   => 'Proceso completado correctamente.',
        1   => 'Error de configuracion. Revise el archivo config.env.',
        2   => 'No fue posible conectar a la terminal BlueZone.',
        3   => 'Error de inicio de sesion. Credenciales invalidas o sesion rechazada.',
        4   => 'No fue posible cambiar la contraseña expirada.',
        5   => 'No se pudo acceder al menu TRANSACTION MENU.',
        6   => 'No se encontraron reservaciones para procesar.',
        7   => 'Error durante el procesamiento de reservaciones.',
        8   => 'Error al sincronizar resultados con el servidor.',
        999 => 'Error critico no controlado en el script BlueZone.',
    );
}

function avis_bot_user_message($errorCode, $customMessage, $stats)
{
    $messages = avis_bot_error_messages();
    $base = isset($messages[$errorCode]) ? $messages[$errorCode] : 'Error desconocido.';

    if ($customMessage !== '') {
        $base = $customMessage;
    }

    if ($errorCode === 0 && is_array($stats)) {
        $total = isset($stats['total']) ? (int) $stats['total'] : 0;
        $correctos = isset($stats['correctos']) ? (int) $stats['correctos'] : 0;
        $noEncontrados = isset($stats['noEncontrados']) ? (int) $stats['noEncontrados'] : 0;
        $errores = isset($stats['errores']) ? (int) $stats['errores'] : 0;

        $base = sprintf(
            'Proceso completado. Total: %d, correctos: %d, no encontrados: %d, errores: %d.',
            $total,
            $correctos,
            $noEncontrados,
            $errores
        );
    }

    return $base;
}

function avis_bot_ensure_data_dir()
{
    if (!is_dir(AVIS_BOT_DATA)) {
        mkdir(AVIS_BOT_DATA, 0775, true);
    }
}

function avis_bot_log($message)
{
    avis_bot_ensure_data_dir();
    $line = date('Y-m-d H:i:s') . ' ' . $message . PHP_EOL;
    file_put_contents(AVIS_BOT_LOG, $line, FILE_APPEND | LOCK_EX);
}

function avis_bot_json_response($payload, $httpStatus)
{
    http_response_code($httpStatus);
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

function avis_bot_read_json_body()
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return null;
    }

    $decoded = json_decode($raw, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        return null;
    }

    return $decoded;
}

function avis_bot_normalize_payload($payload)
{
    $normalized = array(
        'status' => 'error',
        'errorCode' => 999,
        'message' => 'Payload invalido.',
        'stats' => array(
            'total' => 0,
            'correctos' => 0,
            'noEncontrados' => 0,
            'errores' => 0,
        ),
        'results' => array(),
    );

    if (!is_array($payload)) {
        return $normalized;
    }

    // Formato nuevo: { status, errorCode, message, stats, results }
    if (isset($payload['status']) || isset($payload['errorCode']) || isset($payload['results'])) {
        $normalized['status'] = isset($payload['status']) ? (string) $payload['status'] : 'error';
        $normalized['errorCode'] = isset($payload['errorCode']) ? (int) $payload['errorCode'] : 999;
        $normalized['message'] = isset($payload['message']) ? (string) $payload['message'] : '';

        if (isset($payload['stats']) && is_array($payload['stats'])) {
            $normalized['stats'] = array(
                'total' => isset($payload['stats']['total']) ? (int) $payload['stats']['total'] : 0,
                'correctos' => isset($payload['stats']['correctos']) ? (int) $payload['stats']['correctos'] : 0,
                'noEncontrados' => isset($payload['stats']['noEncontrados']) ? (int) $payload['stats']['noEncontrados'] : 0,
                'errores' => isset($payload['stats']['errores']) ? (int) $payload['stats']['errores'] : 0,
            );
        }

        if (isset($payload['results']) && is_array($payload['results'])) {
            $normalized['results'] = avis_bot_normalize_results($payload['results']);
        }

        return $normalized;
    }

    // Formato legado: [ { reservacion, wpa }, ... ]
    if (isset($payload[0]) && is_array($payload[0])) {
        $results = avis_bot_normalize_results($payload);
        $correctos = 0;

        foreach ($results as $item) {
            if ($item['status'] === 'OK' && $item['wpa'] !== '') {
                $correctos++;
            }
        }

        $normalized['status'] = 'success';
        $normalized['errorCode'] = 0;
        $normalized['message'] = 'Sincronizacion completada (formato legado).';
        $normalized['stats'] = array(
            'total' => count($results),
            'correctos' => $correctos,
            'noEncontrados' => 0,
            'errores' => count($results) - $correctos,
        );
        $normalized['results'] = $results;
    }

    return $normalized;
}

function avis_bot_normalize_results($results)
{
    $normalized = array();

    foreach ($results as $row) {
        if (!is_array($row)) {
            continue;
        }

        $reservacion = '';
        if (isset($row['reservacion'])) {
            $reservacion = trim((string) $row['reservacion']);
        } elseif (isset($row['reservation'])) {
            $reservacion = trim((string) $row['reservation']);
        }

        $wpa = isset($row['wpa']) ? trim((string) $row['wpa']) : '';
        $status = isset($row['status']) ? strtoupper(trim((string) $row['status'])) : 'OK';

        if ($status === '' && $wpa !== '') {
            $status = 'OK';
        }

        $normalized[] = array(
            'reservacion' => $reservacion,
            'wpa' => $wpa,
            'status' => $status,
        );
    }

    return $normalized;
}

function avis_bot_save_last_result($payload)
{
    avis_bot_ensure_data_dir();
    file_put_contents(
        AVIS_BOT_RESULTS,
        json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT),
        LOCK_EX
    );
}
