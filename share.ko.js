//JSHint globals
/*global
window:true,
ko:true
*/

(function(window, ko){

    ko.binded = function( property, nestedProperty, target){

        var setterGetter = function(value){
            var propertyValue = typeof property === "function" ? property() : this[property]();

            if (propertyValue){
                return propertyValue[nestedProperty](value);
            }
        };

        return ko.computed({
            read: setterGetter,
            write: setterGetter,
            owner: target
        })
    };

	//if the property is local the object sharejsdocument syncer ignores
	ko.observable.fn.local = ko.computed.fn.local = function(){
		this.isLocal = true;
		return this;
	};


	ko.observable.fn.subscribeOnce = ko.computed.fn.subscribeOnce = function( callback, callbackTarget, event ){
		var sub = this.subscribe( function(){
            var returnValue = callback.apply(this, arguments);
            sub.dispose();
            return returnValue;
        }, callbackTarget, event );

        return sub;
	};


	ko.observableArray.fn.lastItem = function(){
		return this()[ this().length - 1 ];
	};

	ko.isLocal = function( prop ){
		return this.isObservable(prop) && prop.isLocal;
	};



	var out =
	window.sko = {};

    var identityFunction = function(arg){return arg;};

    out.subscribeWithHistory = function(property, callback, callbackTarget, previousValueHandler/*in case you want to modify the previousValue in same way first*/){
        previousValueHandler = previousValueHandler || identityFunction;
        var previousValue;
        var subscriptionBeforeChange = property.subscribe(function(valueBeforeChange){
            previousValue = extendSubscription.previousValueHandler(valueBeforeChange);
        }, callbackTarget, "beforeChange");

        /*why not use subscriptionOnce? because it does too many object deletions (with the dispose)*/
        var subscription = property.subscribe(function(newValue){
            return callback.call(this, newValue, previousValue);
        }, callbackTarget);

        var extendSubscription = Object.create(subscription);
        extendSubscription.dispose = function(){
            subscriptionBeforeChange.dispose();
            return subscription.dispose();
        };
        extendSubscription.previousValueHandler = previousValueHandler;
        return extendSubscription;
    };

    var subscribeWithHistory = function(){
        return out.subscribeWithHistory.apply(this,arguments);
    };



	var koProperMapping = ko.propermap = function( koObj, plain, propCreator ){
		//ko.mapping.fromJS( doc.get() , obj); buggy

		propCreator = propCreator || identityFunction;

		Object.keys( plain ).forEach( function(key){
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


    var subscriptionsGroup = {
        collection: null,
        dispose: function(){
            Object.keys(this.collection).forEach(function(sub){
                sub.dispose();
            });
            this.collection = null;
        },
        disposeOf: function(subscriptionKey){
            var sub = this[subscriptionKey];
            if (sub) sub.dispose();
            this[subscriptionKey] = undefined;
        }
    };

    var extendSubscriptionGroup = function(properties){
        var extendedObject = Object.create(subscriptionsGroup);
        return _.extend(extendedObject, properties);
    };

    subscriptionsGroup = {
        collection:[],
        subscribe: function(){
            this.collection.push( this.extendSubscription(objShare.on.apply(objShare,arguments)) );
        },
        extendSubscription: function(subscription){
            var extension = Object.create(subscription);
            extension.dispose = function(){
                subscription.cb = function(){};//TODO: hack! this won't stop sharejs from calling it, albeit it will be calling an empty function
            }
            return extension;
        }
    };

    var extendShareSubscriptionGroup = function(properties){
        var extendedObject = Object.create(subscriptionsGroup);
        return _.extend(extendedObject, properties);
    }


    var silentKVOProto =
    out.silentKVOProto = {
        _firedBySelf: false,
        setter: function(koProperty, newValue){
            this._firedBySelf = true;
            koProperty( newValue );
            this._firedBySelf = false;
        },
        caller: function(callback){
            var silentKVO = this;
            return function(){
                if (!silentKVO._firedBySelf) return callback.apply(this, arguments);
            }
        },
        //a subscription model that won't call the callback if the property was set with the silent(this) set
        subscribe: function(koProperty, callback, callbackTarget){
            return koProperty.subscribe( this.caller(callback), callbackTarget);
        },
        subscribeWithHistory: function(koProperty, callback, callbackTarget){
            return subscribeWithHistory(koProperty, this.caller(callback), callbackTarget)
        }
    };




	var objectSync =
	out.objectSync = function( objKo, objShare, propertyCreator, initialSync ){

		propertyCreator = propertyCreator || identityFunction;

		//how to set the first sync?
		//assume the server is authoritive, but if the server does not have the values
		//then the local should be sent
        initialSync = initialSync || koProperMapping;
        koProperMapping.apply(this, arguments);

        var silentKVO = Object.create(silentKVOProto);

        var synchronizationState = {
            childrenSyncs: extendSubscriptionGroup({
                collection:{},
                synchronize: function(propertyKey){
                    var propertyValue = objKo[propertyKey]();
                    if ( typeof propertyValue === "object" && propertyValue !== null ){
                        this.disposeOf(propertyKey);
                        this.collection[propertyKey] = objectSync( propertyValue, objShare.at(propertyKey) );
                    }
                }
            }),
            koSubscriptions: extendSubscriptionGroup({
                collection:{},
                subscribe: function(propertyKey){
                    var property = objKo[propertyKey];
                    if ( ko.isObservable( property ) ){
                        this.disposeOf(propertyKey);
                        this.collection[propertyKey] = silentKVO.subscribeWithHistory(
                            property,
                            this.propertySubscriptionHandler.bind(this, propertyKey)
                        );
                    }
                },
                subscribeToAll: function(){
                    Object.keys(objKo).forEach( function(propertyKey){
                        this.subscribe(propertyKey);

                        //deepness
                        //this.synchronize(propertyKey);
                    }.bind(this));
                },
                propertySubscriptionHandler: function(propertyKey, newValue, previousValue){
                    var property = objKo[propertyKey];
                    var childrenSyncs = synchronizationState.childrenSyncs;
                    if ( !ko.isLocal( property ) ){
                        childrenSyncs.disposeOf(propertyKey);
                        if ( typeof newValue === "object" ){
                            childrenSyncs.synchronize(propertyKey);
                            newValue = ko.toJS( newValue );
                        }
                        objShare.at(propertyKey).set( newValue );
                    }
                }
            }),
            shareSubscriptions: extendSubscriptionGroup({
                collection:[],
                subscribe: function(){
                    this.collection.push( this.extendSubscription(objShare.on.apply(objShare,arguments)) );
                },
                extendSubscription: function(subscription){
                    var extension = Object.create(subscription);
                    extension.dispose = function(){
                        subscription.cb = function(){};//TODO: hack! this won't stop sharejs from calling it, albeit it will be calling an empty function
                    }
                    return extension;
                }
            }),
            dispose: function(){
                this.childrenSyncs.dispose();
                this.koSubscriptions.dispose();
                this.shareSubscriptions.dispose();
            }
        };



        /*
        * Knockout.js
        * */

        synchronizationState.koSubscriptions.subscribeToAll();


        /*
        * Share.js
        * */
        var shareSubscriptions = synchronizationState.shareSubscriptions;

        //a change in document is set to the koObject with this setter
        var shareJsSetter = function( key, property ){
            var newProperty = propertyCreator( property, key);
            var prop = objKo[key];
            if ( ko.isWriteableObservable( prop ) && !ko.isLocal( prop ) ){
                silentKVO.set(prop, newProperty);
            }
            else if ( !ko.isComputed( prop ) && !ko.isLocal( prop ) ){
                objKo[key] = newProperty;
            }
        };

        //this is crazy, sometimes the remoteop is called, other times it's the replace
        //luckily it has been mutually exclusive

        shareSubscriptions.subscribe("remoteop", function(operations){
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
                    shareJsSetter( key, newValue );
				}
			});
		});



        shareSubscriptions.subscribe("replace", function( key, oldVal, newVal){
			console.log("replace");
			console.log(arguments);
            shareJsSetter( key, newVal );
		});


        return synchronizationState;
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


    var subscribeArray =
    out.subscribeWithHistoryToArray = function( observable, callback, callbackTarget ){
        return subscribeWithHistory(observable, callback, callbackTarget, function(arrayBeforeChange){
            return arrayBeforeChange.slice(0)
        });
	};


    //helpfull for duck friendliness and to avoid chained calls


	var arrayKOInitialSync = function(arrayKO, arrayShare, itemCreator){
		arrayShare.get().forEach(function(value, index){
            value = itemCreator(value);
			arrayKO.setAt(index, value);
		});
	};

	var arraySync =
	out.arraySync = function(arrayKO, arrayShare, itemCreator, docChange, strategy){

		console.log("arraySync");
		console.log(arguments);
		strategy = strategy || arrayKOInitialSync;
		strategy(arrayKO, arrayShare, itemCreator);

		itemCreator = itemCreator || identityFunction;
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

    var isPropertySynchronizable = function(property){
        return ko.isWriteableObservable(property) && !ko.isLocal(property);
    };

    var objectSynchronizableKeys = function(obj){
        return Object.keys(obj).filter(function(prop){
            return isPropertySynchronizable(prop);
        });
    };

    var forEachSynchronizableProperty = function(obj, callback, callbackTarget){
        var filteredKeys = objectSynchronizableKeys(obj);
        callback = callback.bind(callbackTarget);
        filteredKeys.forEach(function(propKey){
            callback( obj[propKey], propKey);
        });
        return filteredKeys;
    };

    var isObservableArray = function(property){
        return ko.observableArray.fn.isPrototypeOf(property);
    };


    out.propertyDocSync = function(property, doc){
        var propSync;
        if (isObservableArray(property)){
            propSync = out.observableArrayDocSync(property);
        }
        else if (ko.isObservable(property)){
            propSync = out.observableDocSync(property);
        }
        else if (typeof property === "object"){
            propSync = out.objectDocSync = function(property, doc);
        }
        else{

        }
        return propSync;
    };

    var removeDoc = function(doc){
        if (doc.remove){
            doc.remove();
        }
        else{
            doc.set(undefined);
        }
    };

    out.valueDocSync = function(value, doc, parentSync, childKey){
        var sync = {
            parentSync: parentSync,
            childKey: childKey,//key where you can find value in parent
            value: value,
            document: doc,
            shareSubscriptions: null,
            synchronize: function(){
                var docValue = doc.get();
                if (docValue !== undefined){
                    parentSync.property[childKey] = docValue;
                }
                else{
                    doc.set(value);
                }
            },
            dispose: function(){
                removeDoc(doc);
            },
            init: function(){
            }
        };
    };

    out.objectDocSync = function(object, doc){
        var sync = {
            property: object,
            document: doc,
            shareSubscriptions: null,
            childSyncs: extendSubscriptionGroup({
                collection: {},
                syncNew: function(){
                    Object.keys(object).forEach(function(property, propKey){
                        var propSync;
                        if ( this.collection[propKey].property !== property){
                            collection[propKey] = out.propertyDocSyn(property, doc.at(propKey));
                        }
                        else{
                            console.log("property with key:"+ propKey +" is already synced");
                        }
                    }, this);
                },
                reSync: function(){
                    //deletes old syncs
                    //syncs new properties
                    this.syncNew();
                }
            }),
            dispose: function(){
                childSyncs.dispose();
                doc.
            },
            synchronize: function(){
                this.childSyncs.reSync();
            },
            init: function(){
            }
        };
    };

    out.observableDocSync = function(observable, doc ){

        var sync = {
            value: observable,
            document: doc,
            koSubscription: null,
            shareSubscriptions: null,
            subscriptionFunction: function(){
                this.synchronize();
            },
            syncOfObservableValue: null,
            synchronize: function(){
                var observableValue = observable();
                if (this.syncOfObservableValue) this.syncOfObservableValue.dispose();
                this.syncOfObservableValue = out.propertyDocSync(observableValue);
            },
            init: function(){
                this.koSubscription = observable.subscribe(this.subscriptionFunction);
            }
        };

        sync.init();

        return sync;
    };

    out.observableArrayDocSync = function(observableArray, doc){

    };

})(window, ko);

