/*
 * grunt-loadreport
 * https://github.com/lggarrison/grunt-loadreport
 *
 * Copyright (c) 2015 Lacy Garrison
 * Licensed under the MIT license.
 */

'use strict';

var fs = require("fs-extra");
var csv = require('csv');
var Table = require('cli-table');
var f = require('util').format;
var spawn = require('child_process').spawn;

module.exports = function(grunt) {

    var options = null;
    var reportDir = 'reports/';
    var reportFile = '/loadreport.csv';

    grunt.registerMultiTask('loadreport', 'Automate running Speedgun with Grunt', function() {

        function findPath(path, test) {
            try {
                var stats = fs.lstatSync(path);
                if (stats[test]()) {
                    return true;
                }
            } catch (e) {
                return false;
            }
        }

        function findFile(path) {
            return findPath(path, 'isFile');
        }

        function findDirectory(path) {
            return findPath(path, 'isDirectory');
        }

        function findLoadreportDirectory() {

            var targetDirs = [
                'node_modules/loadreport',
                'node_modules/grunt-loadreport/node_modules/loadreport'
            ];

            for (var i = 0, l = targetDirs.length; i < l; i++) {
                var dir = targetDirs[i];
                if(findDirectory(dir)) {
                    return dir;
                }
            }

            return false;

        }

        function handleSpawnClose() {

            grunt.log.writeln('handleSpawnClose');
            grunt.log.writeln(loadreportDir);

            if(findDirectory(serverDir) === false) {
                fs.ensureDirSync(serverDir);
            }

            fs.copySync(loadreportDir + "/" + reportDir + reportFile, serverReport, { clobber: true });
            fs.deleteSync(loadreportDir + "/" + reportDir);
            grunt.task.run(['loadreport-report']);

        }

        var done = this.async();

        var loadreportDir = findLoadreportDirectory();
        if (loadreportDir === false) {
            grunt.fail.fatal("Cannot find loadreport");
            done();
        }

        options = this.options({
            url: 'http://localhost',
            port: null,
            limit: 10,
            timeout: 1000 * 30
        });

        if (typeof(options.port) === 'string') {
            options.port = parseInt(options.port);
        }

        var server = options.url;
        if (options.port !== null) {
            server += ':' + options.port;
        }

        var serverDir = reportDir + server.replace(/(\:\/\/|\:)/g, "_");
        var serverReport = serverDir + reportFile;
        var serverReportExists = findFile(serverReport);

        if(serverReportExists) {
            var dest = loadreportDir + "/" + reportDir + reportFile;
            var src = serverReport;
            fs.ensureFileSync(dest);
            fs.copySync(src, dest, { clobber: true });
        }

        grunt.log.writeln("Measuring " + server);

        var child = spawn('phantomjs', [
            'loadreport.js',
            server,
            'performance',
            'csv'
        ], {
            cwd: loadreportDir,
        });

        child.stdout.on('data', function(data) {
            process.stdout.write(data.toString());
        });

        child.stderr.on('data', function(data) {
            process.stdout.write(data.toString());
            done();
        });

        child.on('close', function(code) {
            grunt.log.writeln("Finished with code " + code);
            clearTimeout(timeoutId);
            if(code !== null) {
                handleSpawnClose();
            } else {

            }
            done();
        });

        var timeoutId = setTimeout(function(){
            grunt.log.writeln('Timeout exceeded');
            grunt.log.writeln('Sending sigkill');
            child.kill();
        }, options.timeout);

    });

    grunt.registerTask('loadreport-report', function() {

        var done = this.async();

        var report = options.url;
        if (options.port !== null) {
            report += '\:' + options.port;
        }

        report = report.replace(/(\:\/\/|\:)/g, "_");
        report = "reports/" + report + "/loadreport.csv";

        function displayReport() {

            var table = new Table({
                head: ['Date', 'domReadystateLoading', 'domReadystateInteractive', 'elapsedLoadTime', 'numberOfResources', 'totalResourcesTime', 'totalResourcesSize'],
                colWidths: [41, 23, 28, 23, 23, 23, 23]
            });

            var input = fs.createReadStream(report);
            var parser = csv.parse({
                columns: true
            });
            var output = [];
            var record = null;

            parser.on('error', function(err) {
                grunt.log.writeln(err.message);
                done();
            });

            parser.on('readable', function() {
                while (record = parser.read()) {
                    output.push(record);
                }
            });

            parser.on('finish', function() {

                var d = new Date();
                var outputLength = output.length;
                for (var i = (outputLength > options.limit) ? outputLength - options.limit : 0; i < outputLength; i++) {
                    record = output[i];
                    d.setTime(record.timeStamp);
                    table.push([
                        d.toString(),
                        record.domReadystateLoading,
                        record.domReadystateInteractive,
                        record.elapsedLoadTime,
                        record.numberOfResources,
                        record.totalResourcesTime,
                        record.totalResourcesSize
                    ]);
                }

                grunt.log.writeln('\n\n\n');
                grunt.log.writeln('Page Loading Speeds: LoadReport');
                grunt.log.writeln(table.toString());
                grunt.log.writeln('\n\n\n');
                done();

            });

            input.pipe(parser);

        }

        if (grunt.file.isFile(report)) {
            displayReport();
        } else {
            grunt.log.writeln(report + "doesn't exist.");
            done();
        }

    });

    grunt.registerTask("default", ["loadreport"]);

};
