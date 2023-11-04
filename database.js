import { createRequire } from "module"
const require = createRequire(import.meta.url)

const db = "mergedCalendar"

var mysql = require('mysql2')

var con = mysql.createConnection({
    host: "localhost",
    port: 3306,
    user: "root",
    password: "password",
    database: db
})

export async function db_createDatabase() {
    con.connect(function(err) {
        // remove database
       // var sql = "DROP DATABASE IF EXISTS " + db
       // query(sql, "Database dropped")

        var sql = "CREATE DATABASE IF NOT EXISTS " + db
        query(sql, "Database created")
        sql = "CREATE TABLE IF NOT EXISTS events (start_time VARCHAR(255), end_time VARCHAR(255), \
                event_key VARCHAR(255), event_name VARCHAR(255), \
                event_description VARCHAR(255), platform VARCHAR(16))"
        query(sql, "Event table created")
        sql = "CREATE TABLE IF NOT EXISTS platforms (platform VARCHAR(16) PRIMARY KEY, user_id VARCHAR(16), \
                api_url VARCHAR(255), oauth_url VARCHAR(255))"
        query(sql, "Platform table created")
    })
}

function eventInTable(obj, callback) {
    var sql = "SELECT event_name FROM events WHERE event_key = '" + obj.event_key 
                + "' AND platform = '" + obj.platform + "'"
    con.query(sql, function (err, result) {
        if (err) throw err

        if (result.length > 0) {
            callback(true)
        } else {
            callback(false)
        }
    })
}

export async function db_addEvent(obj) {
    eventInTable(obj, function(inTable) {
        if (!inTable) {
            var sql = "INSERT INTO events (start_time, end_time, event_key, event_name, event_description, platform) \
                VALUES ('" + obj.start_time + "', '" + obj.end_time + "', '" + obj.event_key 
                + "', '" + obj.event_name + "', '" + obj.event_description + "', '" + obj.platform + "')"
            query(sql, "Event successfully added")
        }
    })
    
}

export async function db_updateEvent(obj) {
    var sql = "SELECT * FROM events WHERE event_key = '" + obj.event_key 
                + "' AND platform = '" + obj.platform + "' LIMIT 1"
    con.query(sql, function (err, result) {
        if (err) throw err

        if (result.length > 0) {
            var update = {
                "start_time": result[0].start_time,
                "end_time": result[0].end_time,
                "event_key": result[0].event_key,
                "event_name": result[0].event_name,
                "event_description": result[0].event_description,
                "platform": result[0].platform
            }
            console.log(update)

            if (obj.start_time != "null" && obj.start_time != "undefined") {
                console.log(obj.start_time)
                update["start_time"] = obj.start_time
            }

            if (obj.end_time != "null" && obj.end_time != "undefined") {
                console.log(obj.end_time)
                update["end_time"] = obj.end_time
            }

            if (obj.event_name != "null" && obj.event_name != "undefined") {
                console.log(obj.event_name)
                update["event_name"] = obj.event_name
            }

            if (obj.event_description != undefined) {
                update["event_description"] = obj.event_description
            }
            var sql = "UPDATE events SET start_time = '" + update.start_time + "', end_time = '" + update.end_time +
                    "', event_name = '" + update.event_name + "', event_description = '" + update.event_description +
                    "' WHERE event_key = '" + update.event_key + "' AND platform = '" + update.platform + "'"
            query(sql, "Event successfully updated")
        } else {
            return
        }
    })
}

export async function db_deleteEvent(obj) {
    eventInTable(obj, function(inTable) {
        if (inTable) {
            con.connect(function(err) {
                var sql = "DELETE FROM events WHERE event_key = '" + obj.event_key + "' AND platform = '" + obj.platform + "'"
                query(sql, "Event successfully deleted")
            })
        }
    })
}

function query(sql, success) {
    con.query(sql, function (err, result) {
        if (err) throw err
        console.log(success)
    })
}