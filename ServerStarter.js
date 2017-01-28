var net = require('net'),
	spawn = require('child_process').spawn,
	WebSocketServer = require('ws').Server,
	EventEmitter = require('events').EventEmitter,
	config = require('./config');

(function(){

	var server = false,
		events = new EventEmitter(),
		wss = new WebSocketServer({port:7086});

	wss.on('connection', function (socket) { 
		console.log("Received a connection");
		socket.on('message', function (message) {
			var data = JSON.parse(message);
			events.emit(data.name, data.data);
		});
	});
	
	events.on('startServer', function () {
		events.emit('stopServer');
		setTimeout(function () {
			server = spawn('node', ['./Server/Server.js']);
			server.stdout.on('data', function (data) {
				console.log('server: ' + data);
			});
			server.stderr.on('data', function (data) {
				console.log('server error: ' + data);
			});
			server.on('error', function(arg) {
				console.log("ERROR");
				console.log(arg);
			});
			console.log("+ Started");
		}, 100 * (config.server.nodeID.charCodeAt(0) - 96));
		
	});
	
	events.on('stopServer', function () { 
		if (server) {
			server.kill("SIGKILL");
			server = false;
			console.log("- Stopped at " + (new Date()).getTime());
		} else {
			console.log("- Server is already down")
		}
	});

})();