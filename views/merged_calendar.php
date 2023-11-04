<?php
/*
  Modified from https://gist.github.com/alifsyr/68966080bb6797ee3d21454adf3fea55
*/

$q = intval($_GET['q']);

$servername = "localhost";

// REPLACE with your Database name
$dbname = "mergedCalendar";
// REPLACE with Database user
$username = "root";
// REPLACE with Database user password
$password = "password";

// Create connection
$conn = new mysqli($servername, $username, $password, $dbname);
// Check connection
if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
} 

if ($q == 1) {  // get everything
  $sql = "SELECT event_name, start_time, end_time, event_key, platform FROM events ORDER BY start_time DESC";
}

if ($q == 2) {  // get Zoom
  $sql = "SELECT event_name, start_time, end_time, event_key, platform FROM events WHERE platform = 'Zoom' ORDER BY start_time DESC";
}

if ($q == 3) {  // get Teams
  $sql = "SELECT event_name, start_time, end_time, event_key, event_description, platform FROM events WHERE platform = 'Teams' ORDER BY start_time DESC";
}

echo '<table cellspacing="5" cellpadding="5">
      <tr> 
        <td>Name</td> 
        <td>Start Time</td> 
        <td>End Time</td> 
        <td>Platform</td>
      </tr>';
 
if ($result = $conn->query($sql)) {
    while ($row = $result->fetch_assoc()) {
        $row_name = $row["event_name"];
        $row_start = $row["start_time"];
        $row_end = $row["end_time"];
        $row_platform = $row["platform"]; 
        $key = $row["event_key"];

        echo "<tr>";
        echo "<td> $row_name </td> ";
        echo "<td> $row_start </td> ";
        echo "<td> $row_end </td>" ;
        echo "<td>$row_platform </td>";
        echo "<td><button onclick=editData('$key','$row_platform') id='" . $key . "' platform='" . $row_platform . "' type='button'>Edit</button></td>";
        echo "<td><button onclick=deleteData('$key','$row_platform') id='" . $key . "' platform='" . $row_platform . "' type='button'>Delete</button></td>";
        echo "</tr>";
            
    }
    $result->free();
}

$conn->close(); 
?> 