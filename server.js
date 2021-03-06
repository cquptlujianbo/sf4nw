var http = require("http");
var cluster = require('cluster');
var config = require('./config');
var HttpRequest = require('./lib/HttpRequest');
var HttpResponse = require('./lib/HttpResponse');
/**
 * 
 * @param {array} initFuns
 */
function init(initFuns) {
	if (initFuns instanceof Array) {
		for (var i=0,len=initFuns.length;i<len;i++) {
			(initFuns[i])();
		}
	}
	
}
/**
 * 
 * @param {function} route
 * @param {array} handle
 * @param {array} filters
 */
function start(route, filters) {
	var filterLen = 0;
	if (filters instanceof Array) {
		filterLen = filters.length;
	}
	function onRequest(request, response) {
		
		
		for(var i=0;i<filterLen;i++) {
			if ((filters[i]).doFilter(request,response) == false) {
				return;
			}
		}
		console.log('cookie:'+request.headers.cookie);
		route(request, response);
	}

	if (cluster.isMaster) {
		// In real life, you'd probably use more than just 2 workers,
		// and perhaps not put the master and worker in the same file.
		//
		// You can also of course get a bit fancier about logging, and
		// implement whatever custom logic you need to prevent DoS
		// attacks and other bad behavior.
		//
		// See the options in the cluster documentation.
		//
		// The important thing is that the master does very little,
		// increasing our resilience to unexpected errors.

		for(var i=0;i<config.WOKER_PROCESS_COUNT;i++) {
			cluster.fork();
		}		

		cluster.on('disconnect', function(worker) {
			console.error('disconnect!');
			cluster.fork();
		});

	} else {
		// the worker
		//
		// This is where we put our bugs!

		var domain = require('domain');

		// See the cluster documentation for more details about using
		// worker processes to serve requests. How it works, caveats, etc.

		var server = require('http').createServer(function(req, res) {
			req = new HttpRequest(req);
			res = new HttpResponse(res);
			
			var d = domain.create();
			d.on('error', function(er) {//处理异常
				console.error('error', er.stack);

				// Note: we're in dangerous territory!
				// By definition, something unexpected occurred,
				// which we probably didn't want.
				// Anything can happen now! Be very careful!

				try {
					// make sure we close down within 30 seconds
					var killtimer = setTimeout(function() {
						process.exit(1);
					}, 30000);
					// But don't keep the process open just for that!
					killtimer.unref();

					// stop taking new requests.
					server.close();

					// Let the master know we're dead. This will trigger a
					// 'disconnect' in the cluster master, and then it will fork
					// a new worker.
					cluster.worker.disconnect();

					// try to send an error to the request that triggered the
					// problem
					res.statusCode = 500;
					res.setHeader('content-type', 'text/plain');
					res.end('矮油，出错了!\n');
				} catch (er2) {
					// oh well, not much we can do at this point.
					console.error('Error sending 500!', er2.stack);
				}
			});

			// Because req and res were created before this domain existed,
			// we need to explicitly add them.
			// See the explanation of implicit vs explicit binding below.
			d.add(req);
			d.add(res);

			// Now run the handler function in the domain.
			d.run(function() {
				onRequest(req, res);
			});
		});
		server.listen(config.HTTP_PORT);
		console.log('start on port ' + config.HTTP_PORT);
	}

}

exports.start = start;
exports.init = init;