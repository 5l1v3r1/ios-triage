#!/usr/bin/env node
'use strict';

var program = require('commander');
var fs = require('fs');
var os = require('os');
var xml2js = require('xml2js');

const child_process = require('child_process');

program
  .version('0.1.0')
  .description('Incident response tool for iPhone or iPad')
  .option('-o, --output [directory]', 'Set output directory')
  .option('-v, --verbose', 'Display verbose output')

program
  .command('collect')
  .description('Collect IR artifacts from iPhone or iPad')
  .action(collectArtifacts);

program
  .command('process')
  .description('Process collected artifacts')
  .action(processArtifacts);

program
  .command('report')
  .description('Generate iOS IR report')
  .action(generateReport);

program.parse(process.argv);

// if program was called with no arguments, show help.
if (program.args.length === 0) program.help();

function setWorkingDirectory (userOutputDir, udid) {
  let wd = ""
  if (userOutputDir) {
    wd = userOutputDir;
  } else {
    wd = __dirname;
  }
  wd = wd + "/" + udid;
  console.log("working directory set to " + wd);
  return(wd);
}

function collectArtifacts () {
  // let's first get the UDID...if we can't do this successfully, we have a problem 
  console.log("starting data run in " + __dirname + " at " + new Date().getTime());
  getUDID(function getDeviceData(error, udid) {
    if (error) { return console.error(error); }

    // no error getting UDID so time to fetch data
    const wd = setWorkingDirectory(program.output, udid);

    // start and keep device syslog running until extraction done
    // in future, maybe allow user to set amount of time to run to track overnight
    var deviceSyslog = getDeviceSyslog(udid, wd);
    var deviceInfo = getDeviceInfo(udid, wd);
    var installedApps = getInstalledApps(udid, wd);
    var provisioningProfiles = listProvisioningProfiles(udid, wd);
    // idevicebackup2 backup --full . (make backup dir)
    // idevicecrashreport -e -k . 
  });
};

function getUDID (callback) {
  var retval = ''; 
var udid = child_process.spawn('idevice_id', ['-l']);

  udid.stdout.on('data', (chunk) => {
    // FIXME: if idevice_id fires the data event more than once the this would overwrite
    // retval which is likley problematic
    retval = chunk;
  });

  udid.on('close', code => {
    /*  
    Unfortunately idevice_id returns a 0 in all situations I checked
    which differs from how ideviceinfo works. If you call idevice_id with
    an invalid parameter or no device is attached, it still returns a 0.
    I'm going to keep this return code != 0 in here for now in case they fix
    in the future. The work around is to test the length for retval and if it is
    41, then we have a UDID returned!
    */
    if (retval.length === 41) {
      // found a valid udid so return null error and uuid value
      // first let's make this a string and trim any newlines
      var udid_str = String.fromCharCode.apply(null, retval);
      console.log("Authorized iDevice found, UDID: " + udid_str.trim());
      callback(null, udid_str.trim());
    } else {
      // encountered some sort of error. If 0 len then no device attached, otherwise something else
      if (retval.length === 0) {
        callback(new Error("No authorized iDevice found. Plug in and authorize a device first."));
      } else {
        callback(new Error(retval));
      };
    };
  });
};

function getDeviceSyslog(udid, wd) { 

  var file_name = 'syslog.txt';
  var file = fs.createWriteStream(wd + '/artifacts/' + file_name);

  // call idevicesyslog binary
  var idevicesyslog = child_process.execFile('idevicesyslog', [], { timeout: 10000 });

  // on data events, write chunks to file
  idevicesyslog.stdout.on('data', (chunk) => { 
    file.write(chunk); 
  });

  // after Stream ends, close the file, inform user of saved file
  idevicesyslog.stdout.on('end', () => { 
    file.end(); 
    console.log('iOS Device syslog saved to: ' + file.path);
  });

  // should this event be on exit or on close?
  // per documentation, not all Streams emit a close event
  // https://nodejs.org/api/stream.html#stream_event_close
  idevicesyslog.on('close', function(code) {
    if (code != 0) {
      console.error('idevicesyslog returned error code ' + code);
    }
  });
  return(idevicesyslog);
};

function getDeviceInfo(udid, wd) { 

  var file_name = 'ideviceinfo.txt';
  var file = fs.createWriteStream(wd + '/artifacts/' + file_name);

  // call ideviceinfo binary
  var ideviceinfo = child_process.spawn('ideviceinfo', []);

  // on data events, write chunks to file
  ideviceinfo.stdout.on('data', (chunk) => { 
    file.write(chunk); 
  });

  // after Stream ends, close the file, inform user of saved file
  ideviceinfo.stdout.on('end', () => { 
    file.end(); 
    console.log('iOS Device info saved to: ' + file.path);
  });

  // should this event be on exit or on close?
  // per documentation, not all Streams emit a close event
  // https://nodejs.org/api/stream.html#stream_event_close
  ideviceinfo.on('close', function(code) {
    if (code != 0) {
      console.error('ideviceinfo returned error code ' + code);
    }
  });
};

function getInstalledApps(udid, wd) { 

  var file_name = 'installed-apps.xml';
  var file = fs.createWriteStream(wd + '/artifacts/' + file_name);

  // call ideviceinstaller binary
  var ideviceinstaller = child_process.spawn('ideviceinstaller', ['--list-apps', '-o','list_all', '-o', 'xml']);

  // on data events, write chunks to file
  ideviceinstaller.stdout.on('data', (chunk) => { 
    file.write(chunk); 
  });

  // after Stream ends, close the file, inform user of saved file
  ideviceinstaller.stdout.on('end', () => { 
    file.end(); 
    console.log('iOS Device installed apps saved to: ' + file.path);
  });

  ideviceinstaller.on('close', function(code) {
    if (code != 0) {
      console.error('ideviceinstaller returned error code ' + code);
    }
  });
};

function listProvisioningProfiles(udid, wd) { 

  var file_name = 'provisioning-profiles.txt';
  var file = fs.createWriteStream(wd + '/artifacts/' + file_name);

  // call ideviceprovision binary
  var ideviceprovision = child_process.spawn('ideviceprovision', ['list']);

  // on data events, write chunks to file
  ideviceprovision.stdout.on('data', (chunk) => { 
    file.write(chunk); 
  });

  // after Stream ends, close the file, inform user of saved file
  ideviceprovision.stdout.on('end', () => { 
    file.end(); 
    console.log('Installed provisioning profiles saved to: ' + file.path);
  });

  ideviceprovision.on('close', function(code) {
    if (code != 0) {
      console.error('ideviceprovision returned error code ' + code);
    }
  });
};

function processArtifacts () {
  console.log("process artifacts");
}

function generateReport () {
  //console.log("generate report");
  var parser = new xml2js.Parser();
  fs.readFile(wd + '/artifacts/installed-apps.xml', function(err, data) {
    parser.parseString(data, function (err, result) {
      console.dir(JSON.stringify(result));
    });
  });

}

