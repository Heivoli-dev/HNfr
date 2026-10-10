<?php
// Public, read-only page. Firebase authentication stays on the main site.
function hn_escape($value) {
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}
function hn_field($fields, $name) {
    return isset($fields[$name]['stringValue']) ? $fields[$name]['stringValue'] : '';
}
function hn_announcements($documents) {
    $html = '';
    foreach ($documents as $entry) {
        if (!isset($entry['document']['fields'])) continue;
        $doc = $entry['document'];
        $fields = $doc['fields'];
        $id = basename($doc['name']);
        $html .= '<div class="announcement"><p class="meta">' . hn_escape(hn_field($fields, 'type')) . '</p>';
        $html .= '<h3>' . hn_escape(hn_field($fields, 'title')) . '</h3>';
        if (isset($fields['createdAt']['timestampValue'])) {
            $stamp = strtotime($fields['createdAt']['timestampValue']);
            if ($stamp !== false) {
                $date = new DateTime('@' . $stamp);
                $date->setTimezone(new DateTimeZone('Europe/Paris'));
                $html .= '<p class="meta">' . $date->format('d/m/Y') . '</p>';
            }
        }
        $html .= '<p class="body">' . hn_escape(hn_field($fields, 'text')) . '</p>';
        $html .= '<a href="https://heivoli-network.fr/annonce.html?id=' . rawurlencode($id) . '">Discussion sur le site complet</a></div>';
    }
    return $html === '' ? '<p>Aucune annonce pour le moment.</p>' : $html;
}
function hn_fetch_announcements() {
    $url = 'https://firestore.googleapis.com/v1/projects/heivoli-network-408f3/databases/(default)/documents:runQuery';
    $payload = json_encode(array('structuredQuery' => array(
        'select' => array('fields' => array(array('fieldPath' => 'title'), array('fieldPath' => 'type'), array('fieldPath' => 'text'), array('fieldPath' => 'createdAt'))),
        'from' => array(array('collectionId' => 'announcements')),
        'orderBy' => array(array('field' => array('fieldPath' => 'createdAt'), 'direction' => 'DESCENDING')),
        'limit' => 6
    )));
    if (function_exists('curl_init')) {
        $handle = curl_init($url);
        curl_setopt_array($handle, array(CURLOPT_POST => true, CURLOPT_POSTFIELDS => $payload,
            CURLOPT_HTTPHEADER => array('Content-Type: application/json'), CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 6, CURLOPT_CONNECTTIMEOUT => 3));
        $body = curl_exec($handle);
        $code = curl_getinfo($handle, CURLINFO_HTTP_CODE);
        curl_close($handle);
        if ($code !== 200 || $body === false) return null;
    } else {
        $context = stream_context_create(array('http' => array('method' => 'POST',
            'header' => "Content-Type: application/json\r\n", 'content' => $payload, 'timeout' => 6)));
        $body = @file_get_contents($url, false, $context);
        if ($body === false) return null;
    }
    $data = json_decode($body, true);
    return is_array($data) && !isset($data['error']) ? $data : null;
}
$template = file_get_contents(__DIR__ . '/index.html');
$cacheFile = __DIR__ . '/cache/announcements.json';
$data = null;
if (is_file($cacheFile) && time() - filemtime($cacheFile) < 300) {
    $data = json_decode(file_get_contents($cacheFile), true);
}
if (!is_array($data)) {
    $data = hn_fetch_announcements();
    if (is_array($data)) {
        @file_put_contents($cacheFile, json_encode($data), LOCK_EX);
    } elseif (is_file($cacheFile)) {
        $data = json_decode(file_get_contents($cacheFile), true);
    }
}
if (is_array($data)) {
    $content = hn_announcements($data);
    $template = preg_replace_callback('/<!-- HN_ANNOUNCEMENTS_START -->[\s\S]*?<!-- HN_ANNOUNCEMENTS_END -->/', function () use ($content) {
        return '<!-- HN_ANNOUNCEMENTS_START -->' . $content . '<!-- HN_ANNOUNCEMENTS_END -->';
    }, $template);
}
header('Content-Type: text/html; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
echo $template;
