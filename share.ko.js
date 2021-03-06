//JSHint globals
/*global
 window:true,
 ko:true,
 _:true,
 console: true
 */

(function(window, ko, undefined){
    "use strict";

    var debugH = window.console.log;
    var console = {};
    console.log = function(){  };


    var out =
        window.sko = {};

    out.factory = {
        proto: {},
        observable: {},
        observableArrays: {},
        computed: {},
        setComputedProperties: function(object){
            _.each(this.computed, function(computedProp, key){
                object[key] = ko.computed( computedProp, object );
            });
        },
        setObservables: function(out){
            _.each(this.computed, function(observable, key){
                out[key] = ko.observable( observable, out );
            });
        },
        setObservableArrays: function(out){
            _.each(this.computed, function(observable, key){
                out[key] = ko.observableArray( observable, out );
            });
        },
        setInstanceObservables: function(out){
            this.setObservables(out);
            this.setObservableArrays(out);
            this.setComputedProperties(out);
        },

        setSubscriptions: function(out){},
        setInitialValuesFromPlain: function(out, plain){
            _.each(plain, function(value, key){
                if ( typeof this[key] === "function"){
                    this[key](value);
                }
                else{
                    this[key] = value;
                }
            }, out);
        },
        construct: function(plain){
            var out = Object.create(this.proto);

            this.setInstanceObservables(out);
            if (plain) this.setInitialValuesFromPlain(out, plain);
            this.setSubscriptions(out);

            this.init();

            return out;
        },
        constructFromPlain: function(plain){
            return this.construct(plain);
        },
        init: function(){

        }
    };

    var silentKVOProto =
        out.silentKVOProto = {
            _firedBySelf: false,
            setter: function(koProperty, newValue){
                this.silentCall(function(){
                    koProperty( newValue );
                });
            },
            silentCall: function(callback, callbackTarget){
                this._firedBySelf = true;
                callback.bind(callbackTarget)();
                this._firedBySelf = false;
            },
            caller: function(callback){
                var silentKVO = this;
                return function(){
                    if (!silentKVO._firedBySelf) callback.apply(this, arguments);
                };
            }
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

    var arrayLastItem =
        out.arrayLastItem = function(array){
            return array[ array.length - 1 ];
        };

    ko.isLocal = function( prop ){
        return this.isObservable(prop) && prop.isLocal;
    };


    var identityFunction = function(arg){return arg;};

    var subscribeWithHistory =
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


    var extendProto =
        out.extendProto = function(prototype, properties){
            var out = Object.create(prototype);
            return _.extend(out, properties);
        };

    var subscriptionsGroup =
        out.subscriptionsGroupProto = {
            collection: null,
            dispose: function(){
                _.forEach(this.collection, function(sub){
                    sub.dispose();
                }, this);
            },
            disposeOf: function(subscriptionKey){
                var sub = this.collection[subscriptionKey];
                if (sub) sub.dispose();
                delete this.collection[subscriptionKey];
            }
        };

    var extendSubscriptionGroup = _.partial(extendProto, subscriptionsGroup);

    var childRelativePath = function(childPath, parentPath){
        if (childPath.length < parentPath.length || childPath.length - 1 > parentPath.length){
            return false;
        }
        var i;
        for (i=0; i<parentPath.length; i++){
            if (parentPath[i] !== childPath[i]) return false;
        }
        return childPath.slice(i);
    };

    //why so much complexity? listeners for subdocs suck, they are buggy as hell
    var callSubOperationsOnly = function(subdoc, event, callback, operations){
        operations.forEach(function(operation){
            var operationPath = operation.p;
            var subDocPath = subdoc.path;
            var operationSubPath = childRelativePath(operationPath, subDocPath);
            if (operationSubPath !== false){
                var subOperation = extendProto(operation, {p: operationSubPath});
                callback.call(this, event, subOperation, subdoc );
            }
        }, this);
    };

    var subscribeToDoc = function(doc,event, callback,callbackTarget){
        if (callbackTarget) callback = callback.bind(callbackTarget);
        doc.on(event, callback);
        return {
            dispose: function(){
                var events = doc._events[event];
                deleteFromArray(events, callback);
            }
        };
    };

    var subscribeToSelfAndChildren =
        out.subscribeToSelfAndChildren = function(subdoc, event, callback, callbackTarget){
            var wrapper = callSubOperationsOnly.bind(callbackTarget, subdoc, event, callback);
            return subscribeToDoc(subdoc.doc,event,wrapper,callbackTarget);
        };



    var unthisify = function(func){
        return function(target){
            return func.apply( target, _.toArray(arguments).slice(1) );
        };
    };


    var deleteIndexFromArrayProto = function(index) {
        return this.splice(index, 1);
    };

    var deleteIndexFromArray =
        out.arrayDeleteByIndex    = unthisify(deleteIndexFromArrayProto);

    var deleteFromArray = ko.utils.arrayRemoveItem;




    var shareSubscriptionsGroupProto = extendProto(subscriptionsGroup,{
        collection:[],
        subscribe: function(subdoc, event, callback, callbackTarget){
            return this.collection.push( subscribeToSelfAndChildren.apply(this, arguments) );
        }
    });

    var extendShareSubscriptionGroup = _.partial(extendProto, shareSubscriptionsGroupProto);




    //the object that keeps the shareJS document and the ko object of the playlist in sync
    //ref: http://stackoverflow.com/a/12257443/689223
    ko.observableArray.fn.setAt = function(index, value) {
        this.valueWillMutate();
        this()[index] = value;
        this.valueHasMutated();
    };



    var insertArrayProto = ko.observableArray.fn.insertAt = function(index, value) {
        this.splice(index, 0, value);
    };

    var insertInArray =
        out.arrayInsertAt = unthisify(insertArrayProto);

    var constructObservableArrayOperation = function(operation){
        return function(){
            this.valueWillMutate();
            operation.apply(this(),arguments);
            this.valueHasMutated();
        };
    };

    //ref: http://stackoverflow.com/questions/5306680/move-an-array-element-from-one-array-position-to-another
    //ref: http://jsperf.com/array-prototype-move
    var scarrottArrayMove = function(pos1, pos2) {
        // local variables
        var i, tmp;
        // cast input parameters to integers
        pos1 = parseInt(pos1, 10);
        pos2 = parseInt(pos2, 10);
        // if positions are different and inside array
        if (pos1 !== pos2 && 0 <= pos1 && pos1 <= this.length && 0 <= pos2 && pos2 <= this.length) {
            // save element from position 1
            tmp = this[pos1];
            // move element down and shift other elements up
            if (pos1 < pos2) {
                for (i = pos1; i < pos2; i++) {
                    this[i] = this[i + 1];
                }
            }
            // move element up and shift other elements down
            else {
                for (i = pos1; i > pos2; i--) {
                    this[i] = this[i - 1];
                }
            }
            // put element from position 1 to destination
            this[pos2] = tmp;
        }
    };

    var arrayMove =
        out.arrayMove = unthisify(scarrottArrayMove);

    var observableArrayMoveProto = constructObservableArrayOperation(scarrottArrayMove);
    var observableArrayMove =
        out.observableArrayMove = unthisify( observableArrayMoveProto );

    var subscribeArray =
        out.subscribeWithHistoryToArray = function( observable, callback, callbackTarget ){
            return subscribeWithHistory(observable, callback, callbackTarget, function(arrayBeforeChange){
                return arrayBeforeChange.slice(0);
            });
        };



    var dummyFunc = function(){};

    var dummy = {
        dispose: dummyFunc,
        synchronize: dummyFunc,
        init: function(){}
    };


    ko.observableArray.fn.isObservableArray = true;

    var isValue = function(value){
        return typeOf(value) === "value";
    };

    var isObservableArray = function(property){
        return property && !!property.isObservableArray;
    };

    var typeOf = function(value){
        var type;
        if (isObservableArray(value)){
            type = "observableArray";
        }
        else if (ko.isObservable(value)){
            type = "observable";
        }
        else if ( typeof value === "function"){
            type = "function";
        }
        else if (typeof value === "object" && value !== null){
            type = "object";
        }
        else{
            type = "value";
        }
        return type;
    };




    var syncProto = {
        isSynchronized: false,
        childSyncs: dummy,
        newValueTransform: identityFunction,
        callNewValueTransform: function(newValue, childKey){
            return this.newValueTransform(newValue, childKey, this.document.path.slice(0), this.value);
        },
        insertChild: function(newValue, childKey){
            newValue = this.callNewValueTransform(newValue, childKey);
            this.replaceChildValue(newValue, childKey);
            this.replaceChild(newValue, childKey);
        },
        docPathComputed: function(){
            var parentDocPath = this.parent().docPath();
            var childKey = this.childKey();
            var path;
            if (childKey === undefined || childKey === null)
                path = parentDocPath.slice(0);
            else
                path = parentDocPath.concat([childKey]);
            return path;
        },
        init: function(value, doc, parentSync, childKey, newValueTransform){
            this.value = value;
            this.document = doc;
            this.parent = ko.observable( parentSync );
            this.childKey = ko.observable( childKey );//the sync's key as a child
            this.docPath = ko.computed(this.docPathComputed, this);
            this.docPath.subscribe(function(docPath){
                this.document.path = docPath;
            }, this);
            if (newValueTransform) this.newValueTransform = newValueTransform;
        },
        remoteOp: function(operation){
            console.log("operation on "+this.docPath()+" operationPath:"+operation.p);
        },
        childRemoteOp: function(operation,childKey,done){
            console.log("child of key:"+childKey+" operation on "+this.docPath()+" operationPath:"+operation.p);
        },
        dispose: function(){
            this.childSyncs.dispose();
        }
    };




    var singleChildProto = extendProto( syncProto, {
        dispose: function(){
            this.childSyncs.dispose();
        },
        replaceChildValue: function(newValue){
            this.value = newValue;
        },
        replaceChild: function(newValue){
            this.childSyncs.dispose();
            var childSyncs = this.childSyncs = this.generateChildSync(newValue);
            if (this.isSynchronized) childSyncs.synchronize();
        },
        generateChildSync: function(childValue){
            return out.propertyDocSync(childValue, this.document, this, this.childKey(), this.newValueTransform);
        },
        synchronize: function(){
            this.isSynchronized = true;
            this.childSyncs.synchronize();
        }
    });


    var isProxySyncNode = function(syncNode){
        return syncNode.docPath().length === syncNode.childSyncs.docPath().length
    };


    var traverseSyncsForRemoteOp = function traverseSyncsForRemoteOp( sync, operation, done, isDone, operationPath ){
        operationPath = operationPath || operation.p;
        var opLen = operationPath.length;
        var child;
        if ( sync.isProxy ){
            child = sync.childSyncs;
        }

        if (opLen === 0){
            if ( sync.isProxy ){
                sync.remoteOp(operation, done);
            }
            else{
                sync.remoteOp(operation);
            }
        }
        else{
            var childKey = operationPath[0];
            if(opLen === 1) sync.childRemoteOp(operation, childKey, done);

            var childSyncs = sync.childSyncs;
            if (childSyncs && childSyncs.hasOwnProperty("collection")){
                child = childSyncs.collection[childKey];
                operationPath = operationPath.slice(1);
            }
        }
        if (child && !isDone()) traverseSyncsForRemoteOp(child,operation, done, isDone, operationPath);
    };


    var rootSyncProto = extendProto( singleChildProto, {
        init: function(value, doc, newValueTransform){
            this.value = value;
            this.document = doc;
            this.docPath = ko.observable( doc.path );
            this.documentSubscription = subscribeToDoc(doc.doc, "remoteop", this.callingAllDocSubscribers, this);
            if (newValueTransform) this.newValueTransform = newValueTransform;
            this.replaceChild(this.value);
        },
        generateChildSync: function(childValue){
            return out.propertyDocSync(childValue, this.document, this, undefined, this.newValueTransform);
        },
        callingAllDocSubscribers: function(operations){
            if (!this.isSynchronized) return;
            operations.forEach(function(operation){
                var _isDone = false;
                var done = function(){
                    _isDone = true;
                };
                var isDone = function(){
                    return _isDone;
                };

                traverseSyncsForRemoteOp( this.childSyncs, Object.create(operation), done, isDone );
            }, this);
        }
    });


    var valueRemoteOp = function(){
        console.log("value sync, share event");
        var doc = this.document;
        console.log(doc.get());
        this.setValueRemote(doc.get());
    };

    var valueSyncProto = extendProto(syncProto, {
        isValid: function(val){
            return isValue(val);
        },
        remoteOp: valueRemoteOp,
        childRemoteOp: valueRemoteOp,
        initialSync: function(){
            var doc = this.document;
            var docValue = doc.get();
            if (docValue !== undefined ){
                this.setValueRemote(docValue);
            }
            else{
                this.setValueLocal(this.value);
            }
        },
        synchronize: function(){
            this.isSynchronized = true;
            this.initialSync();
        },
        setValueLocal: function(value){
            var parent = this.parent();
            var doc = this.document;

            if (!this.isValid(value)){
                this.dispose();
                var childKey = this.childKey();
                if (this.isSynchronized) doc.set(undefined);
                parent.replaceChild( value, childKey);
            }
            else{
                if (this.isSynchronized && value !== doc.get() ){ doc.set(value); }
                this.value = value;
            }
        },
        setValueRemote: function(value){
            var parent = this.parent();
            var childKey = this.childKey();
            if (this.isValid(value)){
                this.value = value;
                parent.replaceChildValue( value, childKey );
            }
            else{
                parent.insertChild( value, childKey );
            }
        }
    });

    var objectSyncProto = extendProto(syncProto, {
        isValid: function(value){
            return this.value === value;
        },
        replaceChildValue: function(newValue, childKey){
            this.value[childKey] = newValue;
        },
        replaceChild: function(newValue, childKey){
            var sync = this.childSyncs.replaceSyncChildWithValue(newValue, childKey);
            if (this.isSynchronized){
                sync.synchronize();
            }
        },
        generateChildSync: function(childValue, childKey){
            return out.propertyDocSync(childValue, this.document.at(childKey), this, childKey, this.newValueTransform);
        },
        setValueLocal: function(value){
            var parent = this.parent();
            var childKey = this.childKey();
            if (this.isSynchronized) this.document.set();
            parent.replaceChild(value, childKey);
        },
        setValueRemote: function(value){
            var parent = this.parent();
            var childKey = this.childKey();
            parent.insertChild( value, childKey );
        },
        initialSync: function(){
            var doc = this.document;
            var docValue = doc.get();
            var childSyncs = this.childSyncs;

            if (typeof docValue === "object" || docValue === undefined || docValue === null){
                if (!docValue) doc.set({});
                childSyncs.syncAll();
            }
            else {
                this.setValueRemote(docValue);
            }
        },
        initOfChildSyncs: function(){
            this.childSyncs = extendProto(objectChildSyncs,{
                collection: {},
                sync: this
            });
        },
        init: function(){
            Object.getPrototypeOf(objectSyncProto).init.apply(this,arguments);

            this.initOfChildSyncs();

            this.childSyncs.setSyncs();
        },
        remoteOp: function(){
            var doc = this.document;
            this.setValueRemote(doc.get());
        },
        childRemoteOp: function(operation, key, done){
            if ( "oi" in operation && !this.childSyncs.isChildSynced(key) ){
                var newValue = operation.oi;
                this.insertChild(newValue, key);
                done();
            }
        },
        synchronize: function(){
            this.isSynchronized = true;
            this.initialSync();
        }
    });

    var objectChildSyncs = extendSubscriptionGroup({
        setSyncs: function(){
            var object = this.sync.value;
            this.setSyncsOfKeys(Object.keys(object));
        },
        setSyncsOfKeys: function(keys){
            var object = this.sync.value;
            keys.forEach(function(propKey){
                this.replaceSyncChildWithValue(object[propKey], propKey);
            }, this);
        },
        syncAll: function(){
            //sync missing props
            var sync = this.sync;
            var object = sync.value;
            var docObj = sync.document.get();
            var missingKeys = _.difference( _.union( Object.keys(object), Object.keys(docObj)), Object.keys(this.collection) );
            this.setSyncsOfKeys(missingKeys);
            _.each(this.collection, function(childSync){
                childSync.synchronize();
            }, this);
        },
        synchronize: function(){
            this.syncAll();
        },
        generateChildSync: function(){
            var sync = this.sync;
            return sync.generateChildSync.apply(sync, arguments);
        },
        replaceSyncChildWithValue: function(newProperty, propKey){
            this.disposeOf(propKey);
            return this.collection[propKey] = this.generateChildSync(newProperty, propKey);
        },
        isChildSynced: function(childKey){
            return !!this.collection[childKey];
        }
    });

    /**
     * remote op subcriptions are called in the ordered they were subscribed
     *  parents subscribe to children first for remote op operations
     * subdocs' paths of child syncs can be changed dynamically, effectivelly changing the remoteop events those children will receive
     */

    var arraySyncProto = extendProto( objectSyncProto, {
        initialSync: function(){
            var doc = this.document;
            var docValue = doc.get();
            var childSyncs = this.childSyncs;

            if ( _.isArray(docValue)  || docValue === undefined || docValue === null){
                if (!docValue) doc.set([]);
                childSyncs.syncAll();
            }
            else {
                this.setValueRemote(docValue);
            }
        },
        remoteOp: function(){
            var doc = this.document;
            this.setValueRemote(doc.get());
        },
        childRemoteOp: function(operation, childKey, done){
            if ( "li" in operation && !("ld"  in operation)/*you are only taking a look for new children*/){
                console.log("Inserting child with key:"+childKey);

                var newValue = operation.li;
                this.remoteInsertChild(newValue, childKey);
                done();
            }
            else if ("li" in operation){//replacing
                //TODO
            }
            else if( "lm" in operation){
                var from = operation.lm;
                var to = childKey;
                this.remoteMoveChild(from,to);
                done();
            }
            else if ("ld" in operation){
                this.remoteRemoveChild(childKey);
                done();
            }
        },


        localInsertChild: function(newValue, index){
            this.document.insert(index, newValue);
            var sync = this.childSyncs.insertChildSync(newValue, index);
            if (this.isSynchronized) sync.synchronize();
        },
        localMoveChild: function(from, to){
            this.document.move(from,to);
            this.childSyncs.moveChild(from,to);
        },
        localRemoveChild: function(index){
            window.console.log("Removing array element with index:"+index);
            window.console.log(this.document.get());
            window.console.log(this.value);
            this.document.at(index).remove();
            this.childSyncs.deleteChild(index);
        },


        remoteInsertChild: function(newValue, index){
            newValue = this.callNewValueTransform(newValue, index);
            this.remoteInsertChildValue(newValue, index);
            var sync = this.childSyncs.insertChildSync(newValue, index);
            if (this.isSynchronized) sync.synchronize();
        },
        remoteInsertChildValue: function(newValue, index){
            insertInArray(this.value, index, newValue);
        },
        remoteMoveChild: function(from,to){
            arrayMove( this.value, from,to );
            this.childSyncs.moveChild(from,to);
        },
        remoteRemoveChild: function(index){
            deleteIndexFromArray( this.value, index);
            this.childSyncs.deleteChild(index);
        },

        initOfChildSyncs: function(){
            this.childSyncs = extendProto(arrayChildSyncs,{
                collection: [],
                sync: this
            });
        }
    });


    var arrayOberservedSyncProto = extendProto(arraySyncProto, {
        replaceChildValue: function(newValue, index){
            console.log("hey there is a new value dick wad!");
            this.parent().silentKVO.silentCall(function(){
                this.parent().observable.setAt(index, newValue);
            }, this);
        },
        remoteInsertChildValue: function(newValue, index){
            this.parent().silentKVO.silentCall(function(){
                insertInArray(this.parent().observable, index, newValue);
            }, this);
        },
        remoteMoveChild: function(from,to){
            this.parent().silentKVO.silentCall(function(){
                observableArrayMove( this.parent().observable, from,to );
            }, this);
            this.childSyncs.moveChild(from,to);
        }
    });


    var arrayChildSyncs = extendProto(objectChildSyncs,{
        insertChildSync: function(childValue, index){
            var newChildSync = this.generateChildSync(childValue, index);
            insertInArray( this.collection, index,  newChildSync);
            var valuesAfter = this.collection.slice(index+1);
            valuesAfter.forEach(function(childSync){
                var index = parseInt( childSync.childKey() );
                childSync.childKey( index + 1  );
            }, this);
            return newChildSync;
        },
        moveChild: function(from, to){
            arrayMove(this.collection, from, to);
            var startIndexForUpdate = from < to ? from : to;

            this.collection.forEach(function(childDoc, newIndex){
                childDoc.childKey(newIndex);
            }, this);
        },
        deleteChild: function(index){
            this.disposeOf(index);
        }
    });



    var observableSyncProto = extendProto(singleChildProto, {
        isProxy: true,
        koSubscription: dummy,
        subscriptionFunction: function(val){
            console.log("KO Notifications, path: "+this.document.path);
            console.log(val);
            this.childSyncs.setValueLocal(val);
        },
        replaceChildValue: function(newValue){
            //child has a new value and can handle it
            var observable = this.observable;
            if ( ko.isObservable(observable) && ko.isWriteableObservable(observable)){
                this.silentKVO.setter(observable,newValue);
            }
        },
        generateChildSync: function(childValue){
            return out.propertyDocSync(childValue, this.document, this, null, this.newValueTransform);
        },
        dispose: function(){
            this.childSyncs.dispose();
            this.koSubscription.dispose();
        },
        koSubcribing: function(){
            this.koSubscription = this.observable.subscribe( this.silentKVO.caller(this.subscriptionFunction), this);
        },
        init: function(observable){
            Object.getPrototypeOf(observableSyncProto).init.apply(this,arguments);
            this.silentKVO = Object.create(silentKVOProto);
            this.childKey.subscribe(function(childKey){
                this.childSyncs.childKey(childKey);
            }, this);
            this.observable = observable;
            if (!ko.isComputed(observable) && !ko.isLocal(observable)){
                var observableValue = observable();
                this.replaceChild(observableValue);
                this.koSubcribing();
            }
        }
    });




    var observableArraySyncProto = extendProto(observableSyncProto, {
        subscriptionFunction: function(val, pre){
            console.log("Array KO Notifications, path: "+this.document.path);
            var modifications = ko.utils.compareArrays(pre, val);
            console.log( ko.toJS( _.filter(modifications, function(mod){ return mod.status !== "retained"}) ) );
            modifications.forEach(function(mod){
                if ( mod.hasOwnProperty("moved")){
                    if (mod.status === "deleted"){
                        this.childSyncs.localMoveChild(mod.index, mod.moved);
                    }
                }
                else if (mod.status === "added"){
                    this.childSyncs.localInsertChild( mod.value, mod.index );
                }
                else if (mod.status === "deleted"){
                    this.childSyncs.localRemoveChild(mod.index);
                }
            }, this);
        },
        generateChildSync: function(childValue){
            return generate.call( arrayOberservedSyncProto, childValue, this.document, this, this.childKey(), this.newValueTransform);
        },
        koSubcribing: function(){
            subscribeArray(this.observable, this.silentKVO.caller(this.subscriptionFunction), this );
        }
    });



    out.propertyDocSync = function(value){
        var syncFunc;
        var type = typeOf(value);
        switch(type){
            case "observable":
                syncFunc = observableSyncProto;
                break;
            case "observableArray":
                syncFunc = observableArraySyncProto;
                break;
            case "function":
                syncFunc = dummy;
                break;
            case "object":
                syncFunc = objectSyncProto;
                break;
            case "value":
                syncFunc = valueSyncProto;
                break;
        }
        console.log("new property of type: "+type+ (type==="observable"? "":"\t")+" \t key:"+arguments[3]);
        return generate.apply(syncFunc, arguments);
    };


    var generate = function(){
        var sync = Object.create(this);
        sync.init.apply(sync, arguments);
        return sync;
    };

    out.sync = function( value, doc, newValueTransform){
        return generate.call(rootSyncProto, value, doc.at(), newValueTransform);
    };

})(window, ko, undefined);