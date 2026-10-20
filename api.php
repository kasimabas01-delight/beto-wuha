<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

// ከኢትዮ ቴሌኮም ዳታቤዝ ጋር ማገናኛ (መረጃውን ከቴሌ የሆስቲንግ ሲ-ፓነል ያገኙታል)
$host = "localhost";
$db_name = "የእርስዎ_ዳታቤዝ_ስም";
$username = "የእርስዎ_ዳታቤዝ_ተጠቃሚ_ስም";
$password = "የእርስዎ_ዳታቤዝ_ይለፍ_ቃል";

try {
    $conn = new PDO("mysql:host=" . $host . ";dbname=" . $db_name, $username, $password);
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch(PDOException $exception) {
    echo json_encode(array("message" => "ከዳታቤዝ ጋር መገናኘት አልተቻለም፦ " . $exception->getMessage()));
    exit();
}

// ከፊት ገጽ የመጣውን መረጃ መቀበያ
$data = json_decode(file_get_contents("php://input"));
$action = isset($_GET['action']) ? $_GET['action'] : '';

// 1. የመግቢያ (Login) ክፍል
if ($action == 'login') {
    if(!empty($data->username) && !empty($data->password) && !empty($data->role)){
        $query = "SELECT * FROM users WHERE username = :username AND password = :password AND role = :role";
        $stmt = $conn->prepare($query);
        $stmt->execute([
            ':username' => $data->username,
            ':password' => $data->password,
            ':role' => $data->role
        ]);
        if($stmt->rowCount() > 0){
            echo json_encode(array("message" => "እንኳን ደህና መጡ!"));
        } else {
            http_response_code(400);
            echo json_encode(array("message" => "የተሳሳተ መረጃ አቅርበዋል!"));
        }
    }
}

// 2. የደንበኛ መመዝገቢያ ክፍል
if ($action == 'register') {
    if(!empty($data->full_name) && !empty($data->meter_number) && !empty($data->meter_type) && !empty($data->kebele) && !empty($data->deadline) && !empty($data->phone_number)){
        $query = "INSERT INTO customers (full_name, meter_number, meter_type, kebele, deadline, phone_number) VALUES (:full_name, :meter_number, :meter_type, :kebele, :deadline, :phone_number)";
        $stmt = $conn->prepare($query);
        if($stmt->execute([
            ':full_name' => $data->full_name,
            ':meter_number' => $data->meter_number,
            ':meter_type' => $data->meter_type,
            ':kebele' => $data->kebele,
            ':deadline' => $data->deadline,
            ':phone_number' => $data->phone_number
        ])){
            http_response_code(201);
            echo json_encode(array("message" => "ደንበኛው በተሳካ ሁኔታ ተመዝግቧል!"));
        } else {
            http_response_code(500);
            echo json_encode(array("message" => "መመዝገብ አልተቻለም።"));
        }
    }
}
?>
