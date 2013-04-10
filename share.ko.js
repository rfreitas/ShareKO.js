//JSHint globals
/*global
 window:true,
 ko:true,
 _:true,
 console: true
 */

(function(window, ko, undefined){

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
            return arrayBeforeChange.slice(0);
        });
    };



    var isObservableArray = function(property){
        return ko.observableArray.fn.isPrototypeOf(property);
    };

    var dummyFunc = function(){};

    var dummy = {
        dispose: dummyFunc,
        synchronize: dummyFunc
    };

    var dummyDisposable = function(){
        return dummy;
    };


    var singleChildProto = {
        childSyncs: dummy,
        dispose: function(){
            this.childSyncs.dispose();
        },
        replaceChildValue: function(newValue){
            this.value = newValue;
        },
        insertChild: function(newValue){
            this.replaceChildValue(newValue);
            this.replaceChild(newValue).synchronize();
        },
        replaceChild: function(newValue){
            this.childSyncs.dispose();
            return this.childSyncs = this.generateChildSync(newValue);
        },
        generateChildSync: function(childValue){
            return out.propertyDocSync(childValue, this.document, this);
        },
        synchronize: function(){
            this.childSyncs.synchronize();
        },
        init: function(){
            this.replaceChild(this.value);
        }
    };



    var isValue = function(value){
        return typeOf(value) === "value";
    };


    var typeOf = function(value){
        var type;
        if (isObservableArray(value)){
            type = "observable";
        }
        else if (ko.isObservable(value)){
            type = "observableArray";
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
        isSynchronized: false
    };

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
            var parent = this.parent;
            var doc = this.document;

            if (!this.isValid(value)){
                this.dispose();
                if (this.isSynchronized) doc.set(undefined);
                parent.replaceChild( value, this.childKey);
            }
            else{
                if (this.isSynchronized && value !== doc.get() ){ doc.set(value); }
                this.value = value;
            }
        },
        init: function(){

        },
        setValueRemote: function(value){
            var parent = this.parent;
            var childKey = this.childKey;
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

    var a;
    var f = function (e,t,n){
        var r= a(this.snapshot,e),
            i=r.elem,
            s=r.key,
            o= {p:e};
        if(i.constructor===Array){
            o.li=t;
            if (typeof i[s]!=="undefined") o.ld=i[s];
        }
        else{
            if(typeof i!=="object")
                throw new Error("bad path");
            o.oi=t;
            if (typeof i[s]!=="undefined") o.od=i[s];
        }
        return this.submitOp([o],n);
    };

    var objectSyncProto = extendProto(syncProto, {
        isValid: function(value){
            return this.value === value;
        },
        replaceChildValue: function(newValue, childKey){
            this.value[childKey] = newValue;
        },
        insertChild: function(newValue, childKey){
            this.replaceChildValue(newValue, childKey);
            this.replaceChild(newValue, childKey);
        },
        replaceChild: function(newValue, childKey){
            var sync = this.childSyncs.syncChildWithValue(newValue, childKey);
            if (this.isSynchronized){
                sync.synchronize();
            }
        },
        generateChildSync: function(childValue, childKey){
            return out.propertyDocSync(childValue, this.document.at(childKey), this, childKey);
        },
        setValueLocal: function(value){
            var parent = this.parent;
            var childKey = this.childKey;
            if ( value !== this.value ){
                if (this.isSynchronized) this.document.set();
                parent.replaceChild(value, childKey);
            }
        },
        setValueRemote: function(value){
            var parent = this.parent;
            var childKey = this.childKey;
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
        init: function(){
            this.childSyncs.setSyncs();
            return this;
        },
        synchronize: function(){
            var doc = this.document;
            this.isSynchronized = true;

            this.initialSync();

            this.shareSubscriptions.subscribe(doc, "remoteop", function(e,operation){
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
            }, this);

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
                this.syncChildWithValue(object[propKey], propKey);
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
        syncChildWithValue: function(newProperty, propKey){
            this.disposeOf(propKey);
            return this.collection[propKey] = this.sync.generateChildSync(newProperty, propKey);
        },
        isChildSynced: function(childKey){
            return !!this.collection[childKey];
        }
    });

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
                    if (!silentKVO._firedBySelf) callback.apply(this, arguments);
                };
            },
            //a subscription model that won't call the callback if the property was set with the silent(this) set
            subscribe: function(koProperty, callback, callbackTarget){
                return koProperty.subscribe( this.caller(callback), callbackTarget);
            },
            subscribeWithHistory: function(koProperty, callback, callbackTarget){
                return subscribeWithHistory(koProperty, this.caller(callback), callbackTarget);
            }
        };

    var observableSyncProto = extendProto(syncProto, {
        koSubscription: dummy,
        childSyncs: dummy,
        isSynchronized: false,
        subscriptionFunction: function(val){
            if(val !== this.childSyncs.value ){
                console.log("ko notified with new value");
                this.childSyncs.setValueLocal(val);
            }
        },
        generateChildSync: function(childValue){
            return out.propertyDocSync(childValue, this.document, this, this.childKey);
        },
        setChildSync: function(childValue){
            this.childSyncs.dispose();
            return this.childSyncs = this.generateChildSync(childValue);
        },
        insertChild: function(newValue){
            //a child has a new value and can't handle it
            this.replaceChildValue(newValue);
            this.replaceChild(newValue);
        },
        replaceChild: function(childValue){
            //in case a child can't handle its value, but the value is not new!
            var sync = this.setChildSync(childValue);
            if (this.isSynchronized) sync.synchronize();
        },
        replaceChildValue: function(newValue){
            //child has a new value and can handle it
            var observable = this.observable;
            if ( ko.isObservable(observable) && ko.isWriteableObservable(observable)){
                silentKVOProto.setter(observable,newValue);
            }
        },
        dispose: function(){
            this.childSyncs.dispose();
            this.koSubscription.dispose();
        },
        init: function(){
            var observable = this.observable;
            if (!ko.isComputed(observable) && !ko.isLocal(observable)){
                var observableValue = observable();
                this.setChildSync(observableValue);
                this.koSubscription = observable.subscribe( silentKVOProto.caller(this.subscriptionFunction), this);
            }
        },
        synchronize: function(){
            this.isSynchronized = true;
            this.childSyncs.synchronize();
        }
    });




    out.propertyDocSync = function(value){
        var syncFunc;
        switch(typeOf(value)){
            case "observable":
                syncFunc = out.observableDocSync;
                break;
            case "observableArray":
                syncFunc = out.observableArrayDocSync;
                break;
            case "function":
                syncFunc = dummyDisposable;
                break;
            case "object":
                syncFunc = out.objectDocSync;
                break;
            case "value":
                syncFunc = out.valueDocSync;
                break;
        }
        return syncFunc.apply(this, arguments);
    };


    out.sync = function( value, doc){
        var sync = extendProto( singleChildProto, {
            document: doc.at(),
            value: value
        });
        sync.init();
        return sync;
    };


    out.valueDocSync = function(value, doc, parentSync, childKey){

        var sync = extendProto(valueSyncProto, {
            shareSubscriptions: extendShareSubscriptionGroup({
                collection:[]
            }),
            value: value,
            document: doc,
            parent: parentSync,
            childKey: childKey
        });

        sync.init();

        return sync;
    };

    out.objectDocSync = function(value, doc, parentSync, childKey){
        //assumes no knowledge of ko and his observables
        var sync = extendProto( objectSyncProto, {
            value: value,
            document: doc,
            parent: parentSync,
            childKey: childKey,
            shareSubscriptions: extendShareSubscriptionGroup({
                collection:[]
            }),
            childSyncs: extendProto(objectChildSyncs,{
                collection: {}
            })
        });

        sync.childSyncs.sync = sync;

        sync.init();

        return sync;
    };

    out.observableDocSync = function(observable, doc, parentSync, childKey ){

        var sync = extendProto(observableSyncProto, {
            observable: observable,
            document: doc,
            parent: parentSync,
            childKey: childKey
        });

        sync.init();

        return sync;
    };

    out.observableArrayDocSync = out.observableDocSync;

})(window, ko, undefined);