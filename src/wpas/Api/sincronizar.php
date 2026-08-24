<?php
/**
 * Recibe resultados del script BlueZone y responde con codigo/mensaje para el cliente.
 *
 * POST JSON (formato nuevo):
 * {
 *   "status": "success|error",
 *   "errorCode": 0,
 *   "message": "texto",
 *   "stats": { "total": 0, "correctos": 0, "noEncontrados": 0, "errores": 0 },
 *   "results": [ { "reservacion": "22974515MX4", "wpa": "1234", "status": "OK" } ]
 * }
 *
 * POST JSON (formato legado):
 * [ { "reservacion": "22974515MX4", "wpa": "1234" } ]
 */

require_once __DIR__ . DIRECTORY_SEPARATOR . 'config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    avis_bot_json_response(array(
        'ok' => false,
        'errorCode' => 405,
        'userMessage' => 'Metodo no permitido. Use POST.',
    ), 405);
}

$payload = avis_bot_read_json_body();
if ($payload === null) {
    avis_bot_log('ERROR sincronizar: JSON invalido o vacio.');
    avis_bot_json_response(array(
        'ok' => false,
        'errorCode' => 400,
        'userMessage' => 'El cuerpo de la peticion debe ser JSON valido.',
    ), 400);
}

$data = avis_bot_normalize_payload($payload);
$isSuccess = ($data['status'] === 'success' && (int) $data['errorCode'] === 0);
$userMessage = avis_bot_user_message($data['errorCode'], $data['message'], $data['stats']);

$stored = array(
    'receivedAt' => date('c'),
    'status' => $data['status'],
    'errorCode' => $data['errorCode'],
    'message' => $data['message'],
    'stats' => $data['stats'],
    'results' => $data['results'],
    'userMessage' => $userMessage,
);

avis_bot_save_last_result($stored);

if ($isSuccess) {
    avis_bot_log(
        'SUCCESS sincronizar: ' .
        'total=' . $data['stats']['total'] .
        ', correctos=' . $data['stats']['correctos'] .
        ', noEncontrados=' . $data['stats']['noEncontrados'] .
        ', errores=' . $data['stats']['errores']
    );
} else {
    avis_bot_log(
        'ERROR sincronizar: code=' . $data['errorCode'] .
        ', msg=' . $data['message']
    );
}

$response = array(
    'ok' => $isSuccess,
    'status' => $data['status'],
    'errorCode' => $data['errorCode'],
    'userMessage' => $userMessage,
    'stats' => $data['stats'],
    'resultsCount' => count($data['results']),
    'results' => $data['results'],
);

avis_bot_json_response($response, $isSuccess ? 200 : 422);
