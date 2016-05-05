'use strict';

// Deps
var util = require( 'util' );
var parseString = require('xml2js').parseString;
var underscore = require('underscore');
var request = require('request');
//var twilio = require('twilio')('ACCOUNT_SID', 'AUTH_TOKEN');
var requestify = require('requestify');
var ET_Client = require( 'fuelsdk-node' );

var http = require('http');
var ws = require('ws.js');
var Http = ws.Http;
var Security = ws.Security;
var UsernameToken = ws.UsernameToken;

var JWT = require('../lib/jwtDecoder');

// test for heroku pipelines http-activity-dev
exports.logExecuteData = [];

function logData( req, http_result ) {
    exports.logExecuteData.push({
    	http_result: {
			body: http_result.body,
			headers: http_result.headers,
			trailers: http_result.trailers,
			method: http_result.method,
			url: http_result.url,			
			request_options: http_result.request_options   	
    	},
    	activity: {
			body: req.body,
			headers: req.headers,
			trailers: req.trailers,
			method: req.method,
			url: req.url,
			params: req.params,
			query: req.query,
			route: req.route,
			cookies: req.cookies,
			ip: req.ip,
			path: req.path,
			host: req.host,
			fresh: req.fresh,
			stale: req.stale,
			protocol: req.protocol,
			secure: req.secure,
			originalUrl: req.originalUrl
		}	
    });
    /*
        console.log( "body: " + util.inspect( req.body ) );
        console.log( "headers: " + req.headers );
        console.log( "trailers: " + req.trailers );
        console.log( "method: " + req.method );
        console.log( "url: " + req.url );
        console.log( "params: " + util.inspect( req.params ) );
        console.log( "query: " + util.inspect( req.query ) );
        console.log( "route: " + req.route );
        console.log( "cookies: " + req.cookies );
        console.log( "ip: " + req.ip );
        console.log( "path: " + req.path );
        console.log( "host: " + req.host );
        console.log( "fresh: " + req.fresh );
        console.log( "stale: " + req.stale );
        console.log( "protocol: " + req.protocol );
        console.log( "secure: " + req.secure );
        console.log( "originalUrl: " + req.originalUrl );
    */ 
}



/*
 * POST Handler for / route of Activity (this is the edit route).
 */
exports.edit = function( req, res ) {
    // Data from the req and put it in an array accessible to the main app.
    //console.log( req.body );;
    res.send( 200, 'Edit' );
};

/*
 * POST Handler for /save/ route of Activity.
 */
exports.save = function( req, res ) {
    // Data from the req and put it in an array accessible to the main app.
    //console.log( req.body );
    res.send( 200, 'Save' );
};

function isEmptyObject(obj) {
  return !Object.keys(obj).length;
};

function headersToJSON() {
	var hdrs = decodeURIComponent(process.env.REQUEST_HEADERS).split(',');
	var json = {};
	for (var i=0;i<hdrs.length-1;i+=2) {
		if (hdrs[i] != '' && hdrs[i+1] != '') {
			json[ hdrs[i] ] = hdrs[i+1];
		}
	}
	return isEmptyObject(json) ? {} : json;
};

function isMC_API(url) {
	var res;
	var u = url.toLowerCase();
	if (u.indexOf('exacttargetapis') > -1) {
		res = 'rest'
	} else if (u.indexOf('exacttarget') > -1) {
		res = 'soap'
	}
	return res;
};

/*
 * POST Handler for /execute/ route of Activity.
 */
exports.execute = function( req, res ) {
	//console.log('body',util.inspect(req.body, {showHidden: false, depth: null}));
	//console.log('body',JSON.stringify(req.body));
	
	/*
	tests:
	non-MC
		http://api.openweathermap.org/data/2.5/weather?zip=10001,us&appid=2de143494c0b295cca9337e1e96b00e0	
	MC-rest
		https://www.exacttargetapis.com/platform/v1/tokenContext
	MC-soap
		https://webservice.s7.exacttarget.com:443/Service.asmx
	soap body:
		<?xml version="1.0"?>
		<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:tns="http://exacttarget.com/wsdl/partnerAPI">
		<soap:Header>
			<fueloauth xmlns="http://exacttarget.com">{{token}}</fueloauth>
		</soap:Header>
		<soap:Body>
			<RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
			  <RetrieveRequest>
				<ObjectType>AccountUser</ObjectType>
				<Properties>Name</Properties>
				<Properties>UserID</Properties>
				<!--<Properties>AssociatedBusinessUnits</Properties>-->
			  </RetrieveRequest>
			</RetrieveRequestMsg>
		</soap:Body>
		</soap:Envelope>	
	soap headers:
		Content-Type: text/xml
		SOAPAction: Retrieve
	*/
	
	//merge the array of objects.
	var aArgs = (req.body && req.body.inArguments) ? req.body.inArguments : [];
	var oArgs = {};
	if (aArgs) {
		for (var i=0; i<aArgs.length; i++) {  
			for (var key in aArgs[i]) { 
				oArgs[key] = aArgs[i][key]; 
			}
		}
	}	

	//console.log('oArgs',util.inspect(oArgs, {showHidden: false, depth: null}));
	//console.log('oArgs',JSON.stringify(oArgs));
	//console.log('token',req.session.token);
	
	var CLIENT_ID = 'myclientid';
	var CLIENT_SECRET = 'myclientsecret';
	var body = decodeURIComponent(process.env.REQUEST_BODY);
	var options = {
		url: decodeURIComponent(process.env.REQUEST_URL),
	  	headers: headersToJSON(),
	  	method: decodeURIComponent(process.env.REQUEST_METHOD)
	};	
	if (body && (body !== 'undefined') && (body.trim() !== '')) options.body = body;
	var IET_Client = new ET_Client(CLIENT_ID,CLIENT_SECRET);
	var mctype = isMC_API(options.url);
	if (mctype) {
		IET_Client.FuelAuthClient.getAccessToken(IET_Client.FuelAuthClient, function(err, body) {	
			if (err) {
				logData( req, err );
				res.send( 500, err );					
			} else {
				if (mctype === 'rest') {
					options.headers.Authorization = 'Bearer ' + body.accessToken;
				} else {
					/*
					  <Header>
						<fueloauth xmlns="http://exacttarget.com">{{token}}</fueloauth>
					  </Header>					
					*/
					if (options.body) options.body = options.body.replace('{{token}}',body.accessToken);
				}
				//request.debug = true;
				try {
					request(options, function (error, response, body) {
						if (error) {
							logData( req, error );
							res.send( 500, error );
						} else {
							logData( req, response );
							res.send( 200, body );
						}
					});				
				} catch(e) {
					logData( req, e );
					res.send( 500, e );				
				}										
			}
		});				
	} else {
		request(options, function (error, response, body) {
			if (error) {
				logData( req, error );
				res.send( 500, error );
			} else {
				logData( req, response );			
				res.send( 200, body );
			}
		});			
	}
	
	
};

/*
 * POST Handler for /publish/ route of Activity.
 */
exports.publish = function( req, res ) {
    // Data from the req and put it in an array accessible to the main app.
    //console.log( req.body );;
    res.send( 200, 'Publish' );
};

/*
 * POST Handler for /validate/ route of Activity.
 */
exports.validate = function( req, res ) {
    // Data from the req and put it in an array accessible to the main app.
    //console.log( req.body );
    res.send( 200, 'Validate' );
};
