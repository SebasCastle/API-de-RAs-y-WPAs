<?php
/**
 * Entrega reservaciones al script BlueZone cuando RESERVATIONS_SOURCE = "HTTP".
 *
 * GET:
 *   - text/plain por defecto (una reservacion por linea)
 *   - ?format=json para {"reservaciones":["22974515MX4","23175201US0"]}
 */

require_once __DIR__ . DIRECTORY_SEPARATOR . 'config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    avis_bot_json_response(array(
        'ok' => false,
        'errorCode' => 405,
        'userMessage' => 'Metodo no permitido. Use GET.',
    ), 405);
}

avis_bot_ensure_data_dir();

$reservaciones = array();

if (is_file(AVIS_BOT_RESERVATIONS_FILE)) {
    $lineas = file(AVIS_BOT_RESERVATIONS_FILE, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lineas as $linea) {
        $linea = trim($linea);
        if ($linea !== '' && strpos($linea, '#') !== 0) {
            $reservaciones[] = $linea;
        }
    }
}

$format = isset($_GET['format']) ? strtolower(trim($_GET['format'])) : 'text';

avis_bot_log('INFO reservaciones: entregadas ' . count($reservaciones) . ' reservacion(es).');

if ($format === 'json') {
    avis_bot_json_response(array(
        'ok' => true,
        'count' => count($reservaciones),
        'reservaciones' => $reservaciones,
    ), 200);
}

header('Content-Type: text/plain; charset=UTF-8');
http_response_code(200);
echo implode("\n", $reservaciones);
exit;
