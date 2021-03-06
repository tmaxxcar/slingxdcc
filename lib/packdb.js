/*
 * ----------------------------------------------------------------------------
 * "THE BEER-WARE LICENSE" (Revision 42):
 * <varga.daniel@gmx.de> wrote this file. As long as you retain this notice you
 * can do whatever you want with this stuff. If we meet some day, and you think
 * this stuff is worth it, you can buy me a beer in return Daniel Varga
 * ----------------------------------------------------------------------------
 */
var packdb = function packdb() {
    //defining a var instead of this (works for variable & function) will create a private definition
    var dirty = require("./dirty/dirty"),
        query = require("dirty-query").query,
        nconf = require("nconf");

    var homePath = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
    var appHome = homePath+'/.slingxdcc/';

    nconf.add('settings', {type: 'file', file: appHome+'config/settings.json'});

    nconf.defaults({
        "logger": {
            "packdb": appHome+"packets.db",
            "autocleandb" : true,
            "cleandb_Xminutes": 60,
            "redundantPercentage": 25,
            "removePacketsOlder_Xhours": false
        }
    });
    nconf.set('logger',nconf.get('logger'));

    nconf.save();

    var packDb = dirty.Dirty(nconf.get('logger:packdb'));


    packDb.on('load', function () {
        this.setCompactingFilter(nconf.get('logger:removePacketsOlder_Xhours'));
        packDb.compact();
    })

    this.onServerKeys = [];

    var nextCompacting = nconf.get('logger:autocleandb') ? new Date().getTime() + nconf.get('logger:cleandb_Xminutes') * 60 * 1000 : 0;

    if (nconf.get('logger:autocleandb')) {
        var minutes = nconf.get('logger:cleandb_Xminutes');
        var redPercentage = nconf.get('logger:redundantPercentage');
        cronID = setInterval(function () {
            if (packDb.redundantLength / (packDb.redundantLength + packDb.length) * 100 > redPercentage) {
                packDb.compact();
            }
            nextCompacting = new Date().getTime() + minutes * 60 * 1000;
        }, minutes * 1000 * 60);
    }

    var self = this;

    var cronID;

    this.getNextCompacting = function(){
        return nextCompacting;
    }

    this.numberOfRedundantPackets = function () {
        return packDb.redundantLength;
    }

    this.compactDb = function () {
        packDb.compact();
    }

    this.stopCompactCronjob = function () {
        if (cronID) {
            clearInterval(cronID);
        }
        nconf.set('logger:autocleandb', false);
        nconf.save();
        nextCompacting = 0;
    }

    this.startCompactCronjob = function (minutes, redPercentage) {
        if (cronID) {
            clearInterval(cronID);
        }
        nextCompacting = new Date().getTime() + minutes * 60 * 1000;
        cronID = setInterval(function () {
            if (packDb.redundantLength / (packDb.redundantLength + packDb.length) * 100 > redPercentage) {
                packDb.compact();
            }
            nextCompacting = new Date().getTime() + minutes * 60 * 1000;
        }, minutes * 1000 * 60);
        nconf.set('logger:autocleandb', true);
        nconf.set('logger:cleandb_Xminutes',minutes);
        nconf.set('logger:redundantPercentage',redPercentage);
        nconf.save();
    }

    this.addPack = function (packObj) {
        if (packObj !== null) {
            packDb.set(packObj.server + '#' + packObj.nick + '#' + packObj.nr, packObj);
        }
    }

    this.numberOfPackets = function () {
        return packDb.size();
    };

    this.getPacket = function (key) {
        return packDb.get(key);
    };

    this.searchPackets = function (string, sortBy, sortOrder, filterDiscon) {
        var q = queryBuilder(null, null, sortBy, sortOrder, string, filterDiscon, null);
        return query(packDb, q.query, q.options);
    };

    this.searchPacketsPaged = function (string, limit, page, sortBy, sortOrder, filterDiscon, cb) {
        if (parseInt(page) == 1) query(packDb, "reset_cache");

        var q = queryBuilder(limit, page, sortBy, sortOrder, string, filterDiscon, cb);

        return query(packDb, q.query, q.options);
    };

    this.setCompactingFilter = function(hours){
        if(hours != false){
            nconf.set('logger:removePacketsOlder_Xhours',hours);
            packDb.setCompactingFilter(function(key,value){
                return (value.lastseen < (parseInt(new Date().getTime()) - hours * 1000 * 60 * 60));
            });
        }else{
            nconf.set('logger:removePacketsOlder_Xhours',false);
            packDb.setCompactingFilter(function(key,value){
                return false;
            })
        }
        nconf.save();
    }

    this.getCompactingFilter = function(){
        return nconf.get('logger:removePacketsOlder_Xhours');
    }

    function queryBuilder(limit, page, sortBy, sortOrder, search, filterDiscon, cb) {
        var buildquery = {
            query: {},
            options: {}
        };

        if (limit !== null) {
            buildquery.options = {
                sortBy: sortBy,
                order: sortOrder,
                limit: limit,
                page: page,
                cache: true,
                pager: cb
            };
        } else {
            buildquery.options = {
                sortBy: sortBy,
                order: sortOrder
            };
        }

        if (typeof search !== 'string') {
            buildquery.query = {nr: {$has: true}};
        } else {
            var words = search.toLowerCase().split(" ");
            buildquery.query.filename = {
                $cb: function (attr) {
                    attr = attr.toLowerCase();
                    for (var i in words) {
                        if (attr.indexOf(words[i]) < 0) {
                            return false;
                        }
                    }
                    return true;
                }
            };
        }

        if (filterDiscon === true) {
            buildquery.query.server = {
                $in: self.onServerKeys
            };
        }
        return buildquery;
    }


    if (packdb.caller != packdb.getInstance) {
        throw new Error("This object cannot be instantiated");
    }
};


/* ************************************************************************
 SINGLETON CLASS DEFINITION
 ************************************************************************ */
packdb.instance = null;

/**
 * Singleton getInstance definition
 * @return singleton class
 */
packdb.getInstance = function () {
    if (this.instance === null) {
        this.instance = new packdb();
    }
    return this.instance;
};
module.exports = packdb.getInstance();
