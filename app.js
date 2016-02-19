'use strict';
// Module Dependencies
// -------------------
var express     = require('express');
var http        = require('http');
var JWT         = require('./lib/jwtDecoder');
var path        = require('path');
var request     = require('request');
var routes      = require('./routes');
var activity    = require('./routes/activity');
var trigger     = require('./routes/trigger');
var config      = require('./config/default');
var parseString = require('xml2js').parseString;
var fs = require('fs');

var configjson  = require('./public/ixn/activities/hello-world/config.json');
var indexhtml;
fs.readFile('./public/ixn/activities/hello-world/index.html', "utf-8", function(err, html) {
	var configVars = ['ACTIVITY_NAME','ACTIVITY_DESCRIPTION','REQUEST_METHOD','REQUEST_URL'];
	if (!process.env.ACTIVITY_NAME) process.env.ACTIVITY_NAME = 'HTTP Request Activity';
	if (!process.env.ACTIVITY_DESCRIPTION) process.env.ACTIVITY_DESCRIPTION = 'This Activity will make a user-defined Http Request.';
	for (var i=0;i<configVars.length;i++) {
		var search = new RegExp('{{'+configVars[i]+'}}', 'g');
		html = html.replace(search,process.env[configVars[i]]);
	}
	indexhtml = html;	
});	
	
var app = express();

// Register configs for the environments where the app functions
// , these can be stored in a separate file using a module like config


var APIKeys = config;
// Simple custom middleware
function tokenFromJWT( req, res, next ) {
    // Setup the signature for decoding the JWT
    var jwt = new JWT({appSignature: APIKeys.appSignature});
    
    // Object representing the data in the JWT
    var jwtData = jwt.decode( req );

    // Bolt the data we need to make this call onto the session.
    // Since the UI for this app is only used as a management console,
    // we can get away with this. Otherwise, you should use a
    // persistent storage system and manage tokens properly with
    // node-fuel
    req.session.token = jwtData.token;
    next();
}

// Use the cookie-based session  middleware
app.use(express.cookieParser());

// TODO: MaxAge for cookie based on token exp?
app.use(express.cookieSession({secret: "HelloWorld-CookieSecret"}));

// Configure Express
app.set('port', process.env.PORT || 3000);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.use(express.logger('dev'));
app.use(express.json());
app.use(express.urlencoded());
app.use(express.methodOverride());
app.use(express.favicon());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// Express in Development Mode
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

// HubExchange Routes
app.get('/', routes.index );
app.post('/login', tokenFromJWT, routes.login );
app.post('/logout', routes.logout );


// Custom Hello World Activity Routes
app.post('/ixn/activities/hello-world/save', activity.save );
app.post('/ixn/activities/hello-world/validate', activity.validate );
app.post('/ixn/activities/hello-world/publish', activity.publish );

//setup middleware for Marketing Cloud API calls:
//app.post('/ixn/activities/hello-world/execute/', tokenFromJWT, activity.execute );
app.post('/ixn/activities/hello-world/execute', activity.execute );

//replace template values with environment variables.
app.get( '/ixn/activities/hello-world/config.json', function( req, res ) {
	var appName = 'APP_NAME';
	var actKey = 'KEY';
	var actName = 'ACTIVITY_NAME';
	var actDesc = 'ACTIVITY_DESCRIPTION';
	var search = new RegExp('{{'+appName+'}}', 'g');
	var json = JSON.parse(JSON.stringify(configjson)); //clone it.
	json.arguments.execute.url = configjson.arguments.execute.url.replace(search,process.env[appName]);
	json.configurationArguments.save.url = configjson.configurationArguments.save.url.replace(search,process.env[appName]);
	json.configurationArguments.publish.url = configjson.configurationArguments.publish.url.replace(search,process.env[appName]);
	json.configurationArguments.validate.url = configjson.configurationArguments.validate.url.replace(search,process.env[appName]);
	json.edit.url = configjson.edit.url.replace(search,process.env[appName]);
	search = new RegExp('{{'+actKey+'}}', 'g');
	json.configurationArguments.applicationExtensionKey = configjson.configurationArguments.applicationExtensionKey.replace(search,process.env[actKey]);
	search = new RegExp('{{'+actName+'}}', 'g');
	json.lang['en-US'].name = configjson.lang['en-US'].name.replace(search,process.env[actName]);	
	search = new RegExp('{{'+actDesc+'}}', 'g');
	json.lang['en-US'].description = configjson.lang['en-US'].description.replace(search,process.env[actDesc]);	
	res.status(200).send( json );
});

//replace template values with environment variables.
app.get( '/ixn/activities/hello-world/index.html', function( req, res ) {
	res.status(200).send( indexhtml );		
});
app.get( '/ixn/activities/hello-world/', function( req, res ) {
	res.status(200).send( indexhtml );		
});


// Custom Hello World Trigger Route
app.post('/ixn/triggers/hello-world/', trigger.edit );

// Abstract Event Handler
app.post('/fireEvent/:type', function( req, res ) {
    var data = req.body;
    var triggerIdFromAppExtensionInAppCenter = 'http-trigger';
    var JB_EVENT_API = 'https://www.exacttargetapis.com/interaction-experimental/v1/events';
    var reqOpts = {};

    if( 'helloWorld' !== req.params.type ) {
        res.send( 400, 'Unknown route param: "' + req.params.type +'"' );
    } else {
        // Hydrate the request
        reqOpts = {
            url: JB_EVENT_API,
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + req.session.token
            },
            body: JSON.stringify({
                ContactKey: data.alternativeEmail,
                EventDefinitionKey: triggerIdFromAppExtensionInAppCenter,
                Data: data
            })
        };

        request( reqOpts, function( error, response, body ) {
            if( error ) {
                console.error( 'ERROR: ', error );
                res.send( response, 400, error );
            } else {
                res.send( body, 200, response);
            }
        }.bind( this ) );
    }
});

app.get('/clearList', function( req, res ) {
	// The client makes this request to get the data
	activity.logExecuteData = [];
	res.send( 200 );
});


// Used to populate events which have reached the activity in the interaction we created
app.get('/getActivityData', function( req, res ) {
	// The client makes this request to get the data
	if( !activity.logExecuteData.length ) {
		res.send( 200, {data: null} );
	} else {
		res.send( 200, {data: activity.logExecuteData} );
	}
});

http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});
