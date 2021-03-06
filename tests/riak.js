var dulcimer = require('../index.js');
var RiakDulcimer = require('riak-dulcimer');
var db = RiakDulcimer('riak://localhost:8087/default');
var async = require('async');
var verymodel = require('verymodel');
var dbstreams = require('../lib/streams');
var uuid = require('uuid-v4');

process.on('uncaughtException', function (err) {
    console.trace();
    console.error(err.stack);
    process.exit();
});
console.log("Testing riak");

module.exports = {
    'Create multiple children': function (test) {
        var TM = new dulcimer.Model({idx: {}}, {db: db, name: 'TM'});
        var TMC = new dulcimer.Model({cidx: {}}, {db: db, name: 'RC'});
        var tm = TM.create({idx: 1});
        tm.save(function (err) {
            var cidx = 0;
            async.whilst(function () {
                cidx++;
                return cidx <= 10;
            },
            function (acb) {
                var tmc = tm.createChild(TMC, {cidx: cidx});
                tmc.save(function (err) {
                    acb(err);
                });
            },
            function (err) {
                tm.getChildren(TMC, function (err, children, info) {
                    test.equal(children.length, 10, "Not all children found (" + children.length + ")");
                    children[0].delete(function (err) {
                        tm.getChildren(TMC, function (err, children, info) {
                            test.equal(info.total, 9);
                            test.done();
                        });
                    });
                });
            });
        });
    },
    'Get Children By Index': function (test) {
        var TM = new dulcimer.Model({idx: {}}, {name: 'TMI', db: db});
        var TMC = new dulcimer.Model({cidx: {type: 'integer', index: true}}, {name: 'RCI', db: db});
        var tm = TM.create({idx: 1});
        tm.save(function (err) {
            var cidx = 0;
            async.whilst(function () {
                cidx++;
                return cidx <= 10;
            },
            function (acb) {
                var tmc = tm.createChild(TMC, {cidx: cidx % 2});
                tmc.save(function (err) {
                    acb(err);
                });
            },
            function (err) {
                tm.getChildrenByIndex(TMC, 'cidx', 1, function (err, children, info) {
                    test.equal(children.length, 5, "Not all children found (" + children.length + ")");
                    test.done();
                });
            });
        });
    },
    'Custom keyname': function (test) {
        var TM = new dulcimer.Model({idx: {}}, {db: db, name: 'TM'});
        var tm = TM.create({idx: 'crap', key: 'custom'});
        test.equal(tm.key, 'custom');
        test.done();

    },
    'Keyname is not undefined': function (test) {
        var TM = new dulcimer.Model({idx: {}}, {db: db, name: 'TM'});
        var tm = TM.create({idx: 'crap'});
        test.notEqual(tm.key, 'TM!undefined');
        test.done();
    },
    'Delete old index': function (test) {
        var TM = new dulcimer.Model({idx: {index: true}, name: {}}, {db: db, name: 'DOI'});
        var tm = TM.create({'idx':  'ham', 'name': 'swiss'});
        tm.save(function (err) {
            test.ifError(err);
            TM.getByIndex('idx', 'ham', function (err, tms) {
                test.ifError(err);
                test.equals(tms.length, 1, 'Should have had one');
                tm.idx = 'salami';
                tm.save(function (err) {
                    test.ifError(err);
                        TM.getByIndex('idx', 'ham', function (err, tms) {
                            test.ok(Array.isArray(tms));
                            test.equals(tms.length, 0);
                            TM.getByIndex('idx', 'salami', function (err, tms) {
                                test.equals(tms.length, 1);
                                test.done();
                            });
                        });
                    //}, 3000);
                });
            });
        });
    },
    'Delete key': function (test) {
        var TM = new dulcimer.Model({idx: {}}, {db: db, name: 'TM'});
        var tm = TM.create({idx: 'crap', key: 'custom', index: true});
        test.equal(tm.key, 'custom');
        tm.save(function (err) {
            test.ifError(err, "error");
            TM.delete('custom', function (err) {
                test.ifError(err);
                test.done();
            });
        });
    },
    "Don't default with value": function (test) {
        var TM = new dulcimer.Model({idx: {default: 'crap'}, required: true}, {db: db, name: 'DDF'});
        var tm = TM.create({idx: 'news'});
        test.equals(tm.idx, 'news');
        test.done();
    },
    "Don't default function with value": function (test) {
        var TM = new dulcimer.Model({idx: {default: function () { return 'crap'; }, required: true}}, {db: db, name: 'DDF'});
        var tm = TM.create({idx: 'news'});
        test.equals(tm.idx, 'news');
        var tmo = tm.toJSON();
        test.equals(tmo.idx, 'news');
        tm.save(function (err) {
            TM.load(tm.key, function (err, ntm) {
                test.equals(ntm.idx, 'news');
                test.done();
            });
        });

    },
    "Update shouldn't create a duplicate": function (test) {
        var TM = new dulcimer.Model({idx: {}}, {db: db, name: 'ND'});
        var tm = TM.create({idx: 'hi'});
        tm.save(function (err) {
            TM.update(tm.key, {idx: 'nope'}, function (err, ntm) {
                test.equals(tm.key, ntm.key);
                TM.all(function (err, tms, info) {
                    test.equals(tms.length, 1);
                    test.equals(info.total, 1);
                    test.done();
                });
            });
        });
    },
    "Update shouldn't create a new if previous isn't found": function (test) {
        var TM = new dulcimer.Model({idx: {}}, {db: db, name: 'ND'});
        TM.update('xxx', {idx: 'hi'}, function (err, tm) {
            test.ok((err !== undefined));
            test.equals(typeof tm, 'undefined');
            test.done();
        });
    },
    "Indexes shouldn't get duplicated": function (test) {
        var TM = new dulcimer.Model({idx: {index: true}, name: {}}, {db: db, name: 'HAM'});
        var tm = TM.create({idx: 'nope', name: 'ham'});
        tm.save(function (err) {
            TM.update(tm.key, {name: 'cheese'}, function (err, ntm) {
                TM.update(ntm.key, {name: 'chowder'}, function (err, ntm2) {
                    TM.getByIndex('idx', 'nope', function (err, tms) {
                        test.equals(tms.length, 1);
                        test.done();
                    });
                });
            });
        });
    },
    "Deleting one index shouldn't delete all": function (test) {
        var TM = new dulcimer.Model({idx: {}, name: {index: true}}, {db: db, name: 'ATM'});
        var idx = 0;
        async.whilst(
            function () {
                idx++;
                return idx <= 10;
            },
            function (acb) {
                var tm = TM.create({idx: idx, name: true});
                tm.save(acb);
            },
            function (err) {
                TM.getByIndex('name', true, function (err, tms) {
                    test.equals(tms.length, 10);
                    TM.update(tms[0].key, {name: false}, function (err, ntm) {
                        TM.getByIndex('name', true, function (err, tms) {
                            test.equals(tms[0].name, true);
                            test.equals(tms.length, 9);
                            test.done();
                        });
                    });
                });
            }
        );
    },
    "Test offset and limit": function (test) {
        var TM = new dulcimer.Model({idx: {}, name: {}}, {db: db, name: 'ARP'});
        var idx = 0;
        async.whilst(
            function () {
                idx++;
                return idx <= 100;
            },
            function (acb) {
                var tm = TM.create({idx: idx, name: 'billy' + idx});
                tm.save(acb);
            },
            function (err) {
                TM.all({limit: 10, offset: 10}, function (err, tms, info) {
                    test.equals(info.total, 100);
                    test.equals(tms.length, 10);
                    test.done();
                });
            }
        );
    },
    "onSave": function (test) {
        var XR = new dulcimer.Model({
            idx: {},
            name: {}
        }, {
            db: db,
            name: 'onsave',
            onSave: function (err, opts, cb) {
                test.ok(opts.changes.name.changed);
                test.ok(!opts.changes.idx.changed);
                test.ok(opts.ctx === 'hullo');
                cb(err);
            }
        });
        var tm = XR.create({idx: 1, name: 'Billy'});
        tm.name = 'Unbilly';
        tm.save({ctx: 'hullo'}, function (err) {
            test.done();
        });
    },
    "onDelete": function (test) {
        var XR = new dulcimer.Model({
            idx: {},
            name: {}
        }, {
            db: db,
            name: 'ondel',
            onDelete: function (err, opts, cb) {
                cb(err);
            }
        });
        var tm = XR.create({idx: 1, name: 'Billy'});
        tm.save(function (err) {
            tm.delete(function (err) {
                test.done();
            });
        });
    },
    "get by child key": function (test) {
        var TM = new dulcimer.Model({idx: {}}, {db: db, name: 'gbckp'});
        var TMC = new dulcimer.Model({cidx: {}}, {db: db, name: 'childgbcp'});
        var tm = TM.create({idx: 1});
        tm.save(function (err) {
            var tmc = tm.createChild(TMC, {cidx: 2});
            tmc.save(function (err) {
                tm.getChild(TMC, tmc.key, function (err, result) {
                    test.equals(result.cidx, 2);
                    test.done();
                });
            });
        });
    },
    "boolean indexes": function (test) {
        var TM = new dulcimer.Model({idx: {}, thingy: {index: true}}, {db: db, name: 'boolidx'});
        var tm1 = TM.create({idx: 1, thingy: false});
        tm1.save(function (err) {
            var tm2 = TM.create({idx: 2, thingy: true});
            tm2.save(function (err) {
                TM.getByIndex('thingy', true, function (err, tms) {
                    test.equals(tms.length, 1);
                    test.equals(tms[0].idx, 2);
                    TM.getByIndex('thingy', false, function (err, tms) {
                        test.equals(tms.length, 1);
                        test.equals(tms[0].idx, 1);
                        test.done();
                    });
                });
            });
        });
    },
    "integer indexes": function (test) {
        var TM = new dulcimer.Model({idx: {index_int: true}, thingy: {}}, {db: db, name: 'intidx'});
        var tm = TM.create({idx: 35098, thingy: 'Well hello there!'});
        tm.save(function (err) {
            TM.getByIndex('idx', 35098, function (err, tms) {
                test.equals(tms.length, 1);
                test.equals(tms[0].idx, 35098);
                test.done();
            });
        });
    },
    "index string ordering": function (test) {
        var TZ = new dulcimer.Model({idx: {}, name: {index: true}}, {db: db, name: 'idxorder'});
        var cidx = 0;
        async.eachSeries(['ham', 'cheese', 'zamboni', 'cow', 'nope', 'apple'],
            function (name, acb) {
                var tm = TZ.create({idx: cidx, name: name});
                tm.save(function (err) {
                    acb(err);
                });
            },
            function (err) {
                TZ.all({sortBy: 'name'}, function (err, children) {
                    test.ifError(err);
                    test.equals(children.length, 6);
                    test.equals(children[0].name, 'apple');
                    test.equals(children[1].name, 'cheese');
                    test.equals(children[2].name, 'cow');
                    test.equals(children[3].name, 'ham');
                    test.equals(children[4].name, 'nope');
                    test.equals(children[5].name, 'zamboni');
                    test.done();
                });
            }
        );
    },
    "index integer ordering": function (test) {
        var TZ = new dulcimer.Model({idx: {index_int: true}}, {db: db, name: 'idxintorder'});
        var cidx = 0;
        async.eachSeries([24, 100, 1, 244, 24, 34563653, 50],
            function (name, acb) {
                var tm = TZ.create({idx: name});
                tm.save(function (err) {
                    acb(err);
                });
            },
            function (err) {
                TZ.allSortByIndex('idx', function (err, nums) {
                    test.ifError(err);
                    test.equals(nums.length, 7);
                    test.equals(nums[0].idx, 1);
                    test.equals(nums[1].idx, 24);
                    test.equals(nums[2].idx, 24);
                    test.equals(nums[3].idx, 50);
                    test.equals(nums[4].idx, 100);
                    test.equals(nums[5].idx, 244);
                    test.equals(nums[6].idx, 34563653);
                    TZ.allSortByIndex('idx', {offset: 2, limit: 3, reverse: true}, function (err, nums) {
                        test.ifError(err);
                        test.equals(nums.length, 3);
                        test.equals(nums[0].idx, 100);
                        test.equals(nums[1].idx, 50);
                        test.equals(nums[2].idx, 24);
                        test.done();
                    });
                });
            }
        );
    },
    "Saving Derived Fields": function (test) {
        var TZ = new dulcimer.Model(
        {
            idx: {index_int: true},
            thing1: {
                type: 'boolean',
            },
            thing2: {},
            thing3: {},
            complete: {
                derive: function () {
                    return !!(this.thing1 && this.thing2 && this.thing3);
                },
                index: true,
            },
        },
        {db: db, name: 'derivefield'});
        var tz = TZ.create({idx: 1, thing1: true, thing2: "hi there", thing3: "yo"});
        tz.save(function (err) {
            TZ.getByIndex('complete', true, function (err, tzs) {
                test.equals(tzs.length, 1);
                tzs[0].thing2 = "";
                tzs[0].save(function (err) {
                    TZ.getByIndex('complete', false, function (err, tzs) {
                        test.equals(tzs.length, 1);
                        TZ.getByIndex('complete', true, function (err, tzs) {
                            test.ok(!tzs || (Array.isArray(tzs) && tzs.length === 0));
                            test.done();
                        });
                    });
                });
            });
        });

    },
    "update doValidate": function (test) {
        var TZ = new dulcimer.Model({idx: {}, email: {type: new verymodel.VeryType().isEmail()}}, {db: db, name: 'updatevalidate'});
        var tz = TZ.create({idx: 1, email: 'userdoozer.com'});
        tz.save(function (err) {
            TZ.update(tz.key, {email: 'asdfsadham.org'}, {validate: true}, function (err, ntz) {
                test.ok(Array.isArray(err) && err.length === 1);
                test.ok(!ntz);
                test.done();
            });
        });
    },
    /*
    "Bucket function": function (test) {
        var Thing = new dulcimer.Model({
                testfield: {}
            },
            {
                dbdir: __dirname,
                name: 'thing'
            });
        var BucketThing = Thing.bucket('ham');

        var x = BucketThing.create({testfield: 'beer'});
        x.save(function (err) {
            BucketThing.load(x.key, function (err, thing) {
                test.ok(BucketThing.options.db.location.indexOf("ham.db", BucketThing.options.db.location.length - "ham.db".length) !== -1);
                test.ok(Thing.options.db.location.indexOf("defaultbucket.db", Thing.options.db.location.length - "defaultbucket.db".length) !== -1);
                test.equals(thing.testfield, 'beer');
                Thing.load(x.key, {bucket: 'ham'}, function (err, thing2) {
                    test.equals(thing2.testfield, 'beer');
                    test.ok(Thing.options.db.location.indexOf("defaultbucket.db", Thing.options.db.location.length - "defaultbucket.db".length) !== -1);
                    test.done();
                });
            });
        });
    },
    "Submodel test": function (test) {
        var SM = new dulcimer.Model({name: {}}, {db: db, name: 'submodel'});
        var PM = new dulcimer.Model({name: {}, thing: {foreignKey: SM}}, {db: db, name: 'parentmodel'});
        var sm = SM.create({name: 'derp'});
        sm.save(function (err) {
            var pm = PM.create({name: 'herp', thing: sm});
            pm.save(function (err) {
                test.ok(pm.toJSON().thing !== 'object');
                PM.load(pm.key, function (err, pm2) {
                    test.ok(pm2.thing.name === 'derp');
                    test.done();
                });
            });
        });
    },
    "Collection Test": function (test) {
        var SM = new dulcimer.Model({name: {}}, {db: db, name: 'submodelcol'});
        var PM = new dulcimer.Model({name: {}, stuff: {foreignCollection: SM}}, {db: db, name: 'parentmodelcol'});
        var sm = SM.create({bucket: 'hi', name: 'derp'});
        sm.save({bucket: 'hi'}, function (err) {
            var  sm2 = SM.create({name: 'lerp'});
            sm2.save({bucket: 'hi'}, function (err) {
                var pm = PM.create({bucket: 'hi', name: 'no more', stuff: [sm.key, sm2.key]});
                pm.save({bucket: 'hi'}, function (err) {
                    PM.load(pm.key, {bucket: 'hi'}, function (err, pm2) {
                        test.ok(pm2.stuff[0].name === 'derp');
                        test.ok(pm2.stuff[1].name === 'lerp');
                        PM.all({depth: 2, bucket: 'hi'}, function (err, pms) {
                            test.done();
                        });
                    });
                });
            });
        });
    },
    */
    "Bad Foreign Key": function (test) {
        var TMa = new dulcimer.Model({idx: {}}, {db: db, name: 'bfka'});
        var TM = new dulcimer.Model({idx: {}, other_id: {foreignKey: TMa, default: {}}, other_col: {foreignCollection: TMa, default: 'lkjsdf'}}, {db: db, name: 'bfkb'});
        var tm = TM.create({idx: 'ham'});
        tm.save(function (err) {
            TM.load(tm.key, function (err, tm2) {
                test.done();
            });
        });
    },
    "Bad Load": function (test) {
        var TM = new dulcimer.Model({idx: {}}, {db: db, name: 'BL'});
        TM.load({}, function (err, tm) {
            test.done();
        });
    },
    "onSet": function (test) {
        var TM = new dulcimer.Model({idx: {}, name: {onSet: function (value) {
            return "cheese";
        }}}, {db: db, name: 'onset'});
        var tm = TM.create({idx: 1, name: 'ham'});
        test.equals(tm.name, 'ham');
        tm.name = 'whatever';
        test.equals(tm.name, 'cheese');
        test.done();
    },
    "key generator": function (test) {
        var out;
        var TM = new dulcimer.Model({idx: {}}, {db: db, name: 'keygenerator', keyGenerator: function (cb) {
            var key = uuid();
            out = key;
            cb(false, key);
        }});
        var tm = TM.create({idx: 1});
        tm.save(function (err) {
            test.equals(tm.key.substr(tm.key.length - out.length), out);
            test.done();
        });
    },
    "keyType": function (test) {
        var TM = new dulcimer.Model({idx: {}}, {db: db, name: 'keytype', keyType: 'uuid'});
        var tm = TM.create({idx: 1});
        tm.save(function (err) {
            test.ok(uuid.isUUID(tm.key));
            test.done();
        });
    },
    "Index Range And Filter": function (test) {
        var TM = new dulcimer.Model({idx: {}, date: {index: true}}, {db: db, name: 'index-range'});
        var cidx = 0;
        async.whilst(function () {
            cidx++;
            return cidx <= 15;
        },
        function (acb) {
            var tm = TM.create({idx: cidx, date: '2014-02-' + (10 + cidx)});
            tm.save(function (err) {
                acb(err);
            });
        },
        function (err) {
            async.series([
                function (scb) {
                    TM.all({index: 'date', indexRange: {start: '2014-02-13', end: '2014-02-17'}}, function (err, tms) {
                        test.equals(tms[0].date, '2014-02-13');
                        test.equals(tms[1].date, '2014-02-14');
                        test.equals(tms[2].date, '2014-02-15');
                        test.equals(tms[3].date, '2014-02-16');
                        test.equals(tms[4].date, '2014-02-17');
                        test.equals(tms.length, 5);
                        scb();
                    });
                },
                function (scb) {
                    TM.all({filter: function (tm) {
                        var day = tm.date.split('-');
                        day = day[day.length - 1];
                        if (parseInt(day, 10) % 2 === 0) {
                            return true;
                        } else {
                            return false;
                        }
                    }, sortBy: 'date'}, function (err, tms) {
                        test.equals(tms[0].date, '2014-02-12');
                        test.equals(tms[1].date, '2014-02-14');
                        test.equals(tms[2].date, '2014-02-16');
                        test.equals(tms[3].date, '2014-02-18');
                        test.equals(tms[4].date, '2014-02-20');
                        scb();
                    });
                }
            ],
            function (err) {
                test.done();
            });
        });
    },
    "User locking": function (test) {
        var TM = new dulcimer.Model({count: {}}, {db: db, name: 'userlock'});
        var increment = function (model, amount, cb) {
            TM.runWithLock(function (unlock) {
                TM.get(model.key, function (err, tm) {
                    tm.count += amount;
                    tm.save({withoutLock: true}, function (err) {
                        unlock(); //removing this causes tests undone
                        cb(err, tm.count);
                    });
                });
            });
        };

        var tm = TM.create({count: 0});
        tm.save(function (err) {
            //yes, each runs the next one before the first ecb
            async.each([10,10,10,10,5,3], function (amount, ecb) {
                increment(tm, amount, ecb);
            }, function (err) {
                TM.get(tm.key, function (err, tm) {
                    test.equals(48, tm.count);
                    test.done();
                });
            });
        });
    },
    /*
    "Wipe test": function (test) {
        var TM = new dulcimer.Model({idx: {}}, {db: db, name: 'wipe'});
        var cidx = 0;
        async.whilst(function () {
            cidx++;
            return cidx <= 20;
        },
        function (acb) {
            var tm = TM.create({idx: {idx: cidx}});
            tm.save(function (err) {
                acb(err);
            });
        },
        function (err) {
            TM.wipe(function (err) {
                test.done();
            });
        });
    },
    */
    
    "Delete All": function (test) {
        dbstreams.deleteKeysWithPrefix({db: db, prefix: "", bucket: 'default!TM'}, function (err) {
            db.close();
            test.done();
        });
    },
};
