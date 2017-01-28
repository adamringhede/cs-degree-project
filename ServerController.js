var net = require('net'),
	spawn = require('child_process').spawn,
	exec = require('child_process').exec,
	WebSocketServer = require('ws').Server,
	EventEmitter = require('events').EventEmitter;

(function(){

	var server,
		running = false,
		events = new EventEmitter(),
		wss = new WebSocketServer({port:7085});

	wss.on('connection', function (socket) { 
		console.log("Received a connection");
		socket.on('message', function (message) {
			var data = JSON.parse(message);
			events.emit(data.name, data.data);
		});
	});
	/*
	events.on('startServer', function () {
		//server = spawn('node', ['./Server/Server.js']);
		server = exec('node ./Server/Server.js');
		server.stdout.on('data', function (data) {
			console.log('server: ' + data);
		});
		console.log(server.pid);
		running = true;
		server.on('close', function () {
			running = false;
		});
		console.log("+ Started");
	});
	*/
	events.on('stopServer', function () {/*
		if (server && running) {
			//server.kill("SIGINT"); 
			process.kill(server.pid, "SIGKILL");
			process.kill(process.pid, "SIGKILL");
			console.log("- Stopped");
		}*/
		process.kill(process.id, "SIGKILL"); // Kill the server from within
		//throw "INECTED FAULT";
	});

})();