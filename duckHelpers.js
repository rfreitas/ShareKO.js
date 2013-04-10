/**
 * Created with JetBrains WebStorm.
 * User: freitas
 * Date: 03/04/2013
 * Time: 20:05
 * To change this template use File | Settings | File Templates.
 */

var method = function(obj, key){
    return function(){
        return obj[key].apply(obj, arguments);
    };
};

var getProperty = function(obj, keyOrPath){
    obj = typeof obj === "function" ? obj() : obj;
    if (keyOrPath.forEach){
        var property;
        keyOrPath.forEach(function(key){
            property = obj[key];
        });
        return property;
    }
    return obj[key];
};

var property = function(obj, key){
    return function(){
        return obj[key];
    }
};


var callMethod = function(methodKey, objectsArray, argsArray){
    var returnValues = [];
    objectsArray.forEach(function(obj){
        var method = obj[methodKey];
        returnValues.push( method.apply(obj, argsArray) );
    });
    return returnValues;
};
