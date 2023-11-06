import { db_createDatabase, db_addEvent, db_updateEvent, db_deleteEvent } from "./database.js"
import { createRequire } from "module"
import { fileURLToPath } from "url"
const require = createRequire(import.meta.url)

const express = require('express')
const parser = require('body-parser')
const axios = require('axios')
const crypto = require('crypto')
const moment = require('moment-timezone')
const fs = require('fs')
const phpExpress = require('php-express') ({
	binPath: 'php'
})
const request = require('request')
const path = require('path')
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const { exec } = require('child_process')
const os = require('os')

const app = express()

// general info
const port = 8080
const ngrokAddress = NGROK_ADDRESS

// database info
db_createDatabase()

// zoom info
const zoomOauthId = ZOOM_CLIENT_ID
const zoomOauthSecret = ZOOM_CLIENT_SECRET
const ZOOM_WEBHOOK_SECRET_TOKEN = ZOOM_WEBHOOK_SECRET


// https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=f6b12cbe-8f66-4c55-96fb-b611577e992d&response_type=code&redirect_uri=https://922e-69-128-36-84.ngrok-free.app/oauth2/callback&scope=https://graph.microsoft.com/.default
// teams info
const teamsClientId = TEAMS_CLIENT_ID
const tenantId = TENANT_ID
const signInLinkTeams = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=' + teamsClientId + '&response_type=code&redirect_uri=https://localhost:' + port + '/oauth2/callback&scope=https://graph.microsoft.com/.default'
const sslCertDirectory = __dirname + '/ssl'
const sslOptions = {
	key: fs.readFileSync(`${sslCertDirectory}/privateKey.key`),
	cert: fs.readFileSync(`${sslCertDirectory}/certificate.crt`),
  }

// outlook info

// google info

app.listen(port, () => {
	console.log("Listening on port " + port)
})

app.use(parser.json())

app.engine('php', phpExpress.engine)
app.all(/.+\.php$/, phpExpress.router)

app.use(express.static(path.join(__dirname, 'public')))

app.get('/', function(req, res){

	// ZOOM AUTH
	if (req.query.code) {
		// request access token for Zoom
		let url = 'https://zoom.us/oauth/token?grant_type=authorization_code&code=' + req.query.code + '&redirect_uri=' + ngrokAddress
		request.post(url, (error, response, body) => {
			// parse response
			body = JSON.parse(body)

			if (body.access_token) {
				let access_token = body.access_token
				console.log("Access token: " + access_token)
				// get current meetings
				request.get('https://api.zoom.us/v2/users/me/meetings', (error, response, body) => {
					if (error) {
						console.log("API Response Error: ", error)
					} else {
						body = JSON.parse(body)

						let meetings = body.meetings
						if (meetings != null) {
							meetings.forEach(event => {
								addEvent(event, "Zoom")
							})
						}
					}
					res.status(200)
				}).auth(null, null, true, access_token)
			} else {
				console.log("Got error")
				console.log(body)
			}
		}).auth(zoomOauthId, zoomOauthSecret)

		// TODO: OUTLOOK AUTH

		// TODO: GOOGLE AUTH

		// render calendar
		res.sendFile(path.join(__dirname, 'public', 'merged_calendar.html'))
		return
	}

	// get access token if none is available
	res.redirect('https://zoom.us/oauth/authorize?response_type=code&client_id=' + zoomOauthId + '&redirect_uri=' + ngrokAddress)
})

// TEAMS OAUTH
var subscriptionId
app.get('/oauth2/callback', async(req, res) => {
	
	try {
		console.log("get callback")
		if (req.query.code) {
			const tokenEndpoint = 'https://login.microsoftonline.com/' + tenantId + '/oauth2/v2.0/token'
			const tokenResponse = await axios.post(tokenEndpoint, querystring.stringify({
				grant_type: 'authorization_code',
				client_id: teamsClientId,
				redirect_uri: 'https://localhost:' + port + '/oauth2/callback',
				code: req.query.code,
				scope: 'https://graph.microsoft.com/.default', // Replace with required scopes
			}), {
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
				},
			})
			let accessToken = tokenResponse.data.access_token

			// get current events
			axios.get('https://graph.microsoft.com/v1.0/me/calendar/events', {
			  headers: {
				Authorization: `Bearer ${accessToken}`,
				'Content-Type': 'application/json'
			  },
			  params: {
				$filter: `end/dateTime ge '${moment().toISOString()}'`
			  }
			})
			.then((response) => {
			  // Handle the API response to populate with existing data
			  	let events = response.data.value
				if (events != null) {
					events.forEach(event => {
						addEvent(event, "Teams")
					})
				}
			})
		}

		// Subscribe to webhooks
		const subscriptionResponse = await axios.post('https://graph.microsoft.com/beta/subscriptions', { 
			changeType: 'created,updated,deleted', 
			notificationUrl: `${ngrokAddress}/webhooks`, 
			includeResourceData: true, 
			client_id: teamsClientId, 
			encryptionCertificate: sslOptions.cert.toString('base64'), 
			encryptionCertificateId:teamsCertificateId, 
			resource: '/me/events?$select=start,end,subject', 
			expirationDateTime: new Date(Date.now() + 86400000).toISOString(), // 24 hours from now 
			clientState: '07W8Q~6s~Gzx87nxdrulwuNvtxde_-z3tJV84bup', 
		}, { 
			headers: { 
				Authorization: `Bearer ${accessToken}`, 
				'Content-Type': 
				'application/json', 
			}, 
		}) 
		subscriptionId = subscriptionResponse.data.id
	} catch (error) {
		console.log(error.message)
	}
})

// remove Teams subscription when server stops
process.on('SIGINT', async () => {
	if (subscriptionId) {
	  try {
		const graphApiEndpoint = `https://graph.microsoft.com/v1.0/subscriptions/${subscriptionId}`
		await axios.delete(graphApiEndpoint, {
		  headers: {
			Authorization: `Bearer ${accessToken}`,
		  },
		})
		console.log('Subscription deleted.')
	  } catch (error) {
		console.error('Error deleting subscription:', error)
	  }
	}
	process.exit()
})

app.post('/webhooks', function(req, res){
	const message = `v0:${req.headers['x-zm-request-timestamp']}:${JSON.stringify(req.body)}`

	const hashForVerify = crypto.createHmac('sha256', ZOOM_WEBHOOK_SECRET_TOKEN).update(message).digest('hex')

	const zoomSig = `v0=${hashForVerify}`

	// ZOOM VALIDATION AND WEBHOOOKS
	if (req.headers['x-zm-signature'] === zoomSig) {
		if(req.body.event === 'endpoint.url_validation') {
			const hashForValidate = crypto.createHmac('sha256', ZOOM_WEBHOOK_SECRET_TOKEN).update(req.body.payload.plainToken).digest('hex')
	  
			let response = {
			  message: {
				plainToken: req.body.payload.plainToken,
				encryptedToken: hashForValidate
			  },
			  status: 200
			}
	  
			console.log(response.message)
	  
			res.status(response.status)
			res.json(response.message)
		} else {
			if (req.body.event == "meeting.created") {			// ZOOM ADD
				addEvent(req.body.payload.object, "Zoom")
			}
			if (req.body.event == "meeting.deleted") {			// ZOOM DELETE
				deleteEvent(req.body.payload.object, "Zoom")
			}
			if (req.body.event == "meeting.updated") {			// ZOOM UPDATE
				updateEvent(req.body.payload.object, "Zoom")
			}
		}
	}

	// TEAMS VALIDATION AND WEBHOOKS
	if (req.query.validationToken) {
		// Extract the validation token from the query parameter
		const validationToken = req.query.validationToken
		// Response matches the validation token
		res.set('Content-Type', 'text/plain')
		res.status(200).send(validationToken)
	  } else {
		if (req.body.value.changeType == "created") {	// TEAMS ADD
			addEvent(req.body.value, "Teams")
		}
		if (req.body.value.changeType == "deleted") {	// TEAMS DELETE
			deleteEvent(req.body.value, "Teams")
		}
		if (req.body.value.changeType == "updated") {	// TEAMS UPDATE
			updateEvent(req.body.value, "Teams")
		}
		res.status(200).end()
	}
})

// Routing from client
app.get('/addEvent/:name/:start/:end/:platform', function (req, res) {
	console.log("Ajax => Add event " + req.params.name)
	console.log("Start/end: " + req.params.start + "-" + req.params.end)
	console.log("Platform: " + req.params.platform)

	addEventToPlatform(req.params.name, req.params.start, req.params.end, req.params.platform)
})

app.get('/editEvent/:id/:name/:start/:end/:platform', function (req, res) {
	console.log("Ajax => Edit event " + req.params.id + " name: " + req.params.name)
	console.log("Start/end: " + req.params.start + "-" + req.params.end)
	console.log("Platform: " + req.params.platform)

	editEventOnPlatform(req.params.id, req.params.name, req.params.start, req.params.end, req.params.platform)
})

app.get('/deleteEvent/:id/:platform', function (req, res) {
	console.log("Ajax => Delete event " + req.params.id)
	console.log("Platform: " + req.params.platform)

	deleteEventOnPlatform(req.params.id, req.params.platform)
})

// Function to open a URL in Google Chrome
function openInChrome(url) {
	const chromeCommand = os.platform() === 'win32' ? `start chrome  "${url}"` : `open -a "Google Chrome"  "${url}" `
	exec(chromeCommand, (error) => {
	  if (error) {
		console.error('Error opening Chrome:', error)
	  } else {
		console.log('Chrome opened successfully')
	  }
	})
  }

openInChrome(signInLinkTeams)

// Function to add events to platforms (in theory)
function addEventToPlatform(name, start, end, platform) {
	let payload = {
		"start_time": start + ":00Z",
		"end_time": end + ":00Z",
		"event_key": crypto.randomUUID(),
		"event_name": name,
		"platform": platform
	}
	db_addEvent(payload)
}

// Function to edit events on platforms (in theory)
function editEventOnPlatform(event_id, name, start, end, platform) {
	let payload = {
		"start_time": start,
		"end_time": end,
		"event_key": event_id,
		"event_name": name,
		"platform": platform
	}
	console.log(payload)
	db_updateEvent(payload)
}

// Function to delete events on platforms (in theory)
function deleteEventOnPlatform(event_id, platform) {
	let payload = {
		"event_key": event_id,
		"platform": platform
	}
	db_deleteEvent(payload)
}



// Universal function for adding events to database
function addEvent(object, type) {
	console.log("Adding " + type + " event")
	let payload = createPayload(object, type)

	db_addEvent(payload)
}

// Universal function for updating events in database
function updateEvent(object, type) {
	console.log("Updating " + type + " event")
	let payload = createPayload(object, type)

	db_updateEvent(payload)
}

// Universal function for deleting events in database
function deleteEvent(object, type) {
	console.log("Deleting " + type + " event")
	let payload = createPayload(object, type)

	db_deleteEvent(payload)
}

// Universal function for creating payloads
function createPayload(object, type) {
	var payload = ""
	if (type == "Zoom") { // parse for Zoom
		payload = parseZoomEvent(object)
	} else if (type == "Teams") { // parse for Teams
		payload = parseTeamsEvent(object)
	} else if (type == "Outlook") { // parse for Outlook
		payload = parseOutlookEvent(object)
	} else if (type == "Google") { // parse for Google
		payload = parseGoogleEvent(object)
	}
	
	return payload
}

// Function for event parsing
function parseZoomEvent(object) {
	const timestamp = object.start_time

	// convert to utc
	const utc = moment.tz(timestamp, object.timezone).utc().format("YYYY-MM-DDTHH:mm:ss")
	const endTime = moment(utc).add(object.duration, 'minutes').utc().format("YYYY-MM-DDTHH:mm:ss")

	let payload = {
		"start_time": object.start_time,
		"end_time": endTime + "Z",
		"event_key": object.uuid,
		"event_name": object.topic,
		"platform": "Zoom"
	}

	return payload
}

function parseTeamsEvent(object) {

	let decrypted = decryptTeams(object)

	let payload = {
		"start_time": decrypted.start.dateTime,
		"end_time": decrypted.end.dateTime,
		"event_key": decrypted.uuid,
		"event_name": decrypted.subject,
		"event_description": "",
		"platform": "Teams"
	}

	return payload
}

function decryptTeams(object) {
	const encryptedContent = object.encryptedContent 
	const base64encodedPayload = Buffer.from(encryptedContent.data, 'base64') 
	const decodedKey = Buffer.from(encryptedContent.dataKey, 'base64') 
	const privateKey = crypto.createPrivateKey ({ 
		key: sslOptions.key, 
		passphrase: '' // Replace with your actual passphrase 
	}) 
	const decryptedSymetricKey = crypto.privateDecrypt(privateKey, decodedKey) 
	const base64encodedSignature = encryptedContent.dataSignature 
	const hmac = crypto.createHmac('sha256', decryptedSymetricKey) 
	hmac.write(base64encodedPayload, 'base64') 

	if(base64encodedSignature === hmac.digest('base64')) { 
		const iv = Buffer.alloc(16, 0) 
		decryptedSymetricKey.copy(iv, 0, 0, 16) 
		const decipher = crypto.createDecipheriv('aes-256-cbc', decryptedSymetricKey, iv) 
		let decryptedPayload = decipher.update(base64encodedPayload, 'base64', 'utf8') 
		decryptedPayload += decipher.final('utf8') 
		console.log('Decrypted event:') 
		console.log(decryptedPayload.toString('utf8')) 
		let jo = JSON.parse(decryptedPayload.toString('utf8'))		
		
		if(Object.keys(jo).length === 0) {			
			console.log("Empty update")		
		} else { 
			jo.start.dateTime = jo.start.dateTime.slice(0, -1) 
			jo.end.dateTime = jo.end.dateTime.slice(0, -1) 
			jo.uuid = object.resourceData.id
			return jo	
		} 
	} else { 
		console.log("signature compare fails") 
	}
}

/*

let payload = {
	"start_time": "time",
	"end_time": "time",
	"event_key": "key",
	"event_name": "name",
	"event_platform": "platform"
}
*/