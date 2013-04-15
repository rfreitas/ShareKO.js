//JSHint globals
/*global
 window:true,
 ko:true,
 _:true,
 console: true
 */

(function(window, ko, undefined){

    var out =
        window.sko = {};

    out.factory = {
        proto: {},
        computed: {},
        setComputedProperties: function(object){
            var computedProperties = this.computed;
            Object.keys(computedProperties).forEach(function(key){
                var computedProp = computedProperties[key];
                object[key] = ko.computed( computedProp, object );
            });
        },
        setObservables: function(out){},
        setSubscriptions: function(out){},
        setInitialValuesFromPlain: function(out, plain){},
        construct: function(){
            var out = Object.create(this.proto);
            this.setObservables(out);
            this.setComputedProperties(out);
            this.setSubscriptions(out);
            return out;
        },
        constructFromPlain: function(plain){
            if (this.proto.isPrototypeOf(plain)) return plain;//already constructed

            var out = this.construct();
            if (plain) this.setInitialValuesFromPlain(out, plain);

            return out;
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
                callback.call(this, subOperation, subdoc );
            }
        });
    };

    var unthisify = function(func){
        return function(target){
            return func.apply( target, _.toArray(arguments).slice(1) );
        };
    };

    //ref: http://stackoverflow.com/a/9815010/689223
    // Array Remove - By John Resig (MIT Licensed)
    var deleteIndexFromArrayProto = function(from, to) {
        var rest = this.slice((to || from) + 1 || this.length);
        this.length = from < 0 ? this.length + from : from;
        return this.push.apply(this, rest);
    };

    var deleteIndexFromArray = unthisify(deleteIndexFromArrayProto);

    var deleteFromArray = function(array, el){
        var index = array.indexOf(el);
        if (index !== -1) deleteIndexFromArray(array, index);
    };

    var subscribeToSelfAndChildren =
    out.subscribeToSelfAndChildren = function(subdoc, event, callback, callbackTarget){
        var wrapper = callSubOperationsOnly.bind(callbackTarget, subdoc, event, callback);
        var doc = subdoc.doc;
        doc.on(event, wrapper);
        return {
            dispose: function(){
                var events = doc._events[event];
                deleteFromArray(events, wrapper);
            }
        };
    };


    var shareSubscriptionsGroupProto = extendProto(subscriptionsGroup,{
        collection:[],
        subscribe: function(subdoc, event, callback, callbackTarget){
            callback = callback.bind(callbackTarget, event);
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

    var insertInArray = unthisify(insertArrayProto);

    ko.observableArray.fn.deleteAt = function(index){
        return this.splice( index, 1 );
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

    var funcScarrottArrayMove = unthisify(scarrottArrayMove);


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
            if (!childKey) path = parentDocPath.slice(0);
            else path = parentDocPath.concat([childKey]);
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

    var rootSyncProto = extendProto( singleChildProto, {
        init: function(value, doc, newValueTransform){
            this.value = value;
            this.document = doc;
            this.docPath = ko.observable( doc.path );
            if (newValueTransform) this.newValueTransform = newValueTransform;
            this.replaceChild(this.value);
        },
        generateChildSync: function(childValue){
            return out.propertyDocSync(childValue, this.document, this, undefined, this.newValueTransform);
        }
    });



    var valueSyncProto = extendProto(syncProto, {
        isValid: function(val){
            return isValue(val);
        },
        docChangeHandler: function(){
            console.log("value sync, share event");
            var doc = this.document;
            console.log(doc.get());
            this.setValueRemote(doc.get());
        },
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
            this.subscribeToDocument();
        },
        subscribeToDocument: function(){
            var doc = this.document;
            var subs = this.shareSubscriptions;
            subs.dispose();

            var docChangeHandler = this.docChangeHandler.bind(this);
            var subscribe = subs.subscribe.bind(subs, doc);
            subscribe('remoteop', docChangeHandler, this);
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
        init: function(){
            Object.getPrototypeOf(valueSyncProto).init.apply(this,arguments);
            this.shareSubscriptions = extendShareSubscriptionGroup({
                collection:[]
            });
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
        },
        dispose: function(){
            this.shareSubscriptions.dispose();
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
        dispose: function(){
            this.childSyncs.dispose();
            this.shareSubscriptions.dispose();
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

            this.shareSubscriptions = extendShareSubscriptionGroup({
                collection:[]
            });

            this.initOfChildSyncs();

            this.childSyncs.setSyncs();
        },
        remoteOpHandling: function( e, operation ){
            console.log("remote object operation path:"+this.document.path);
            console.log(operation);
            console.trace();
            var doc = this.document;
            var path = operation.p;
            var key = path[0];
            if (path.length === 0){
                this.setValueRemote(doc.get());
            }
            else if ( !this.childSyncs.isChildSynced(key)/*you are only taking a look for new children*/){
                console.log("Inserting child");
                console.log(operation.p);
                console.assert(path.length === 1,"path.length !== 1, it's:"+path.length);
                if ( "oi" in operation ){
                    var newValue = doc.at(key).get();
                    this.insertChild(newValue, key);
                }
            }
        },
        synchronize: function(){
            var doc = this.document;
            this.isSynchronized = true;

            this.shareSubscriptions.subscribe(doc, "remoteop", this.remoteOpHandling, this);

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
        remoteOpHandling: function( e, operation ){
            console.log("remote object operation");
            console.log(operation);
            var doc = this.document;
            var path = operation.p;
            var key = path[0];
            if (path.length === 0){
                this.setValueRemote(doc.get());
            }
            else if ( "li" in operation && !("ld"  in operation)/*you are only taking a look for new children*/){
                console.log("Inserting child");
                console.log(operation.p);
                console.assert(path.length === 1,"path.length !== 1, it's:"+path.length);

                var newValue = operation.li;
                this.actualInsertChild(newValue, key);
            }
        },
        insertChildValueRemote: function(newValue, index){
            insertInArray(this.value, index, newValue);
        },
        actualInsertChild: function(newValue, index){
            newValue = this.callNewValueTransform(newValue, index);
            this.insertChildValueRemote(newValue, index);
            var sync = this.childSyncs.insertChildSync(newValue, index);
            if (this.isSynchronized) sync.synchronize();
        },
        localInsertChild: function(newValue, index){
            this.document.insert(index, null);
            var sync = this.childSyncs.insertChildSync(newValue, index);
            if (this.isSynchronized) sync.synchronize();
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
            silentKVOProto.silentCall(function(){
                this.parent().observable.setAt(index, newValue);
            }, this);
        },
        insertChildValueRemote: function(newValue, index){
            silentKVOProto.silentCall(function(){
                insertInArray(this.parent().observable, index, newValue);
            }, this);
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
        }
    });




    var observableSyncProto = extendProto(singleChildProto, {
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
                silentKVOProto.setter(observable,newValue);
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
            this.koSubscription = this.observable.subscribe( silentKVOProto.caller(this.subscriptionFunction), this);
        },
        init: function(observable){
            Object.getPrototypeOf(observableSyncProto).init.apply(this,arguments);
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
            console.log([ ko.toJS(val), ko.toJS(pre) ]);
            var modifications = ko.utils.compareArrays(pre, val);
            modifications.forEach(function(mod){
                if (mod.status === "added"){
                    this.childSyncs.localInsertChild( mod.value, mod.index );
                }
            }, this);
        },
        generateChildSync: function(childValue){
            return generate.call( arrayOberservedSyncProto, childValue, this.document, this, this.childKey(), this.newValueTransform);
        },
        koSubcribing: function(){
            subscribeArray(this.observable, silentKVOProto.caller(this.subscriptionFunction), this );
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