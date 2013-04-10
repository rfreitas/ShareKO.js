//JSHint globals
/*global Ember:true,_:true,require:true,__dirname:true, process:true*/

var __client_path = __dirname + "/" + "client";

/*
var express = require('express');
var app = express.createServer();
app.listen(8080);
*/


//var bundle = require('browserify')(__client_path + '/entry.js');
//app.use(bundle);



var express = require('express');
var util = require('util');
var sharejs = require('share').server;
var sharejs_client = require('share').client;
//var redis = require("redis");

var app = express();

// configure Express
app.configure(function() {
	//app.use(express.logger());
	app.use(express.cookieParser());
	app.use(express.bodyParser());
	app.use(express.methodOverride());
	app.use(express.session({ secret: 'keyboard cat' }));
	app.use(app.router);
	app.use(express.static(__dirname + '/../../public'));
});

var options = {
	db: {
		type: 'none' //{type: 'redis'}}; // See docs for options. {type: 'redis'} to enable persistance.
	}
};

sharejs.attach(app, options);

/*
app.configure(function(){
		app.use(express.methodOverride());
		app.use(express.bodyParser());
		app.use(app.router);
});
*/

app.configure('development', function(){
	console.log(__dirname);
		app.use(express.static(__dirname) );
	//app.use(express.static(__dirname + "/node_modules/dustjs-linkedin/dist") );
		//app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});



app.listen(8001);

