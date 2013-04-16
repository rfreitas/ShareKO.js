//JSHint globals
/*global
 window:true,
 describe:true,
 _:true,
 console: true,
 beforeEach: true,
 it: true,
 sko:true,
 ko:true
 */


var doc;
var doc1;

var arrayWithObject = ko.observableArray( [{b:ko.observable(1)},2,3] );
var sync;

describe("sync", function() {

    beforeEach(function() {

        runs( function(){
            sharejs.open('test', 'json', function( error, document ) {
                console.log('test');
                console.log(arguments);
                doc = document;
                sync = sko.sync(arrayWithObject, doc);
                sync.synchronize();
                //document.at().set();
                //document.set();
            });
        });

        sko.testing = true;

        waitsFor(function() {
            return !!doc;
        }, "Connection to server's document has failed", 10000);
    });

    afterEach(function() {
       // doc.set(undefined);
        //doc = undefined;
    });

    it("should be able to play a Song", function() {
        var a = ko.observable(1);
        var a1 = ko.observable(0);

        var sync = sko.sync(a, doc);
        var sync1 = sko.sync(a1, doc);

        runs(function(){
            a(2);
        });

        waitsFor(function(){
            return a() === a1();
        }, "objects are diff",1000);
    });
});