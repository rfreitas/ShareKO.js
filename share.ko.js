//JSHint globals
/*global
sclock: true,
window:true,
sharejs:true,
ko:true,
URI:true,
_:true,
sko:true,
YT:true,
cuid:true
*/

(function(window, ko){


	//if the property is local the object sharejsdocument syncer ignores
	ko.observable.fn.local = ko.computed.fn.local = function(){
		console.log(arguments);
		console.log(this);
		this.isLocal = true;
		return this;
	};

	ko.observable.fn.subscribeOnce = ko.computed.fn.subscribeOnce = function( handler, target ){
		var wrapper =  function(){
			handler.apply(this, arguments);
			sub.dispose();
		};
		var sub = this.subscribe.call( this, wrapper, target );
		return sub;
	};

	//callbacks for the next change or after the timeout
	ko.observable.fn.nextChange = ko.computed.fn.nextChange = function( handler, target ){
		//TODO
	};

	ko.observableArray.fn.lastItem = function(){
		return this()[ this().length - 1 ];
	};

	ko.isLocal = function( prop ){
		return this.isObservable(prop) && prop.isLocal;
	};



var out =
window.sko = {};

var setDoc =
out.setDocWithKoObj = function( objKo, doc ){
	doc.set( ko.toJS(objKo) );
};

var setDocWithKoObjAndSyncThem =
out.setDocWithKoObjAndSyncThem = function( objKo, doc ){
	setDoc(objKo, doc);
	objectSync( objKo, doc );
};

var setKoObj = function( obj, doc ){
	ko.mapping.fromJS( doc.get() , obj);
};

var setKoObjSync = function( obj, doc, propCreator ){
	var plain = doc.get();
	
	//ko.mapping.fromJS( plain , obj);//bug
	//koProperMapping( obj, plain, propCreator );//this has to be done before the sync
	//so that the properties coming from the doc don't get feedback into the doc again

	objectSync( obj, doc, propCreator );

	console.log("setKoObjSync");
	console.log(plain);
	console.log( ko.toJS( obj) );
};

var identityFunction = function(arg){return arg;};

var koProperMapping = ko.propermap = function( koObj, plain, propCreator ){
	
	propCreator = propCreator || function(value){return value;};

	Object.keys( koObj ).forEach( function(key){
		var prop = koObj[key];
		var propFromPlain =  propCreator( plain[key], key );

		if ( ko.isWriteableObservable( prop ) ){
			prop( propFromPlain );
		}
		else if( !ko.isComputed( prop ) ){
			//koObj[key] = propFromPlain;
		}
	});
};






var objectSync =
out.objectSync = function( objKo, objShare, propertyCreator ){
	propertyCreator = propertyCreator || function(value){return value;};

	//how to set the first sync?
	//assume the server is authoritive, but if the server does not have the values
	//then the local should be sent

	var kvoFiredByThisFunction = false;
	Object.keys(objKo).forEach( function(key){
		var prop = objKo[key];
		if ( ko.isObservable( prop ) ){
			var ko_prop = prop;
			ko_prop.subscribe( function(newValue){
				if ( !kvoFiredByThisFunction && !ko.isLocal( ko_prop ) ){
					if ( typeof newValue === "object" ){
						newValue = ko.toJS( newValue );
					}
					objShare.at(key).set( newValue );
				}
			});
			prop = ko_prop();
		}

		//deepness
		if ( typeof prop === "object" && prop ){
			//console.log(prop);
			//objectSync( prop, objShare.at(key) );
		}
	});

	var setter = function( key, newValue ){
		newValue = propertyCreator( newValue, key);
		var prop = objKo[key];
		if ( ko.isWriteableObservable( prop ) && !ko.isLocal( prop ) ){
			kvoFiredByThisFunction = true;
			prop( newValue );
			kvoFiredByThisFunction = false;
		}
		else if ( !ko.isComputed( prop ) && !ko.isLocal( prop ) ){
			objKo[key] = newValue;
		}
	};


	//this is crazy, sometimes the remoteop is called, other times it's the replace
	//luckily it has been mutually exclusive

	objShare.on( "remoteop", function(operations){
		console.log("remoteop");
		console.log(arguments);
		operations.forEach(function(operation){
			var path = operation.p;
			if ( path.length !== 1 ){
				console.log("path not supported");
				return;
			}
			var key = path[0];

			if ( "oi" in operation ){
				var newValue = operation.oi;
				setter( key, newValue );
				
			}
		});
	});


	
	objShare.on( "replace", function( key, oldVal, newVal){
		console.log("replace");
		console.log(arguments);
		setter( key, newVal );
	});

	/*
	objShare.on( "child op", function(){
		console.log("child op");
		console.log(arguments);
	});
	*/
};





//the object that keeps the shareJS document and the ko object of the playlist in sync
//ref: http://stackoverflow.com/a/12257443/689223
ko.observableArray.fn.setAt = function(index, value) {
    this.valueWillMutate();
    this()[index] = value;
    this.valueHasMutated();
};

ko.observableArray.fn.insertAt = function(index, value) {
    this.valueWillMutate();
    this.splice(index, 0, value);
    this.valueHasMutated();
};

ko.observableArray.fn.deleteAt = function(index){
	return this.splice( index, 1 );
};

var subscribeArray = function( observable, callback, target ){
	observable.subscribe( function(oldArray){
		oldArray = oldArray.slice(0);
		var sub = observable.subscribe( function(newArray){
			callback.call( target, newArray, oldArray );
			sub.dispose();
		} );
	}, target, "beforeChange");
};

var arraySync =
out.arraySync = function(arrayKO, arrayShare, itemCreator, docChange){
	console.log("arraySync");
	console.log(arguments);

	itemCreator = itemCreator || function(plain){return plain;};
	docChange = docChange || identityFunction;

	//initialization, assumes an empty array from the client
	arrayKO.removeAll();//empty array
	arrayShare.get().forEach( function(value, index){
		//TODO respect the  cuid!
		arrayKO.push( itemCreator( value, index, arrayShare.at(index) ) );
	});

	var arrayChanged = function(newArray, oldArray){
		if (kvoFiredByThisFunction) return;
		console.log("evertyhing changes");
		console.log(arguments);

		//à brugesso
		//needs separations between: replace, move, insert, delete
		
		var indexesToInsertOrReplace = [];//keys that differ
		newArray.forEach( function(value, index){
			if (value !== oldArray[index] ){
				indexesToInsertOrReplace.push( index );
			}
		});

		//the algorith:
		//trim()
		//replaceOrInsert()

		//delete from the end
		//basically, how much do you have to trim the shared array, is the problem.
		var toTrim =  arrayShare.get().length > newArray.length ;

		if (toTrim){
			//this is done synchronously, because aparently the shared array doesn't get updated asynchronisously,
			//unlike my original assumption. What happens if the operation is not successful
			//is an async operation on the shared array, correcting the disallowed operations.
			while (  arrayShare.get().length > newArray.length ){
				var lastIndex = arrayShare.get().length - 1;
				arrayShare.at(lastIndex).remove();
			}
		}

		console.log("inserting on shared array");
		console.log(indexesToInsertOrReplace);
		indexesToInsertOrReplace.forEach( function(index){
			var plain = ko.toJS( newArray[index] );
			arrayShare.at(index).set( plain );
			//arrayShare.submitOp( {p:[i], od:oldArray[i], oi:newArray[i]} );
		});
	};

	
	var setter = function( index, newValue ){
		var doc = arrayShare.at(index);
		//regarding the doc, what happens when the item is moved within the array?
		arrayKO.insertAt(index, itemCreator( newValue, index, doc) );
	};

	var argumentsToArray = function(args){
		var out = [];
		var i;
		for ( i = 0; i < args.length; i++ ){
			out.push( args[i]);
		}
		return out;
	};

	var kvoFiredByThisFunction = false;
	var silentCall = function( setterFunction, arg1, arg2, argN){
		kvoFiredByThisFunction = true;
		var out = setterFunction.apply( this, argumentsToArray( arguments ).slice(1) );
		kvoFiredByThisFunction = false;
	};

	var deleteAt = function(index){
		return arrayKO.deleteAt( index );
	};

	var sub = subscribeArray( arrayKO, arrayChanged );

	/*
	these events used to work, and they certainly have a much cleaner api for the callback
	arrayShare.on ( "insert", function(index, plain){
		console.log("insertion on shared array");
		console.log(arguments);
		setter( index, plain );
	});

	arrayShare.on ( "delete", function(index){
		console.log("deletion on shared array");
		console.log(arguments);
		arrayKO.slice( index, 1 );
	});
	*/

	arrayShare.on( "remoteop", function(operations){
		operations.forEach(function(operation){
			var path = operation.p;
			if ( path.length !== 1){
				console.log("array sync is not deep");
				return;
			}
			console.log("remoteop on shared array");
			console.log(arguments);
			var key = path[0];

			if ( operation.hasOwnProperty("li") ){
				var newValue = operation.li;
				silentCall ( setter, key, newValue );
			}
			else if ( operation.hasOwnProperty("ld") ){//the reason for the else if is that insertion and deletion of the same index
				//is not always mutually exclusive, due to a flaw in the api design, therefore you don't want to delete
				//the same item just inserted
				silentCall ( deleteAt, key );
			}
		});
	});
};

})(window, ko);

