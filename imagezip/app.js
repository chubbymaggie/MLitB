var express    = require('express'),
    bodyParser = require('body-parser'),
    util       = require('util'),
    formidable = require('formidable'),
    fs         = require('fs'),
    jszip      = require('jszip'),
    redis_s    = require('redis');

var UPLOAD_DIR = __dirname + '/uploads/';

var redis = redis_s.createClient();
redis.on("error", function (err) {
    console.log(" $$ redis Error " + err);
});

redis.set('counter', 0);

var app = express();

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

app.set('views', './views')
app.set('view engine', 'jade')

app.use(bodyParser.json())

app.use('/static', express.static(__dirname + '/static'));

app.post('/download', function(req, res) {

    var zip = new jszip();

    var fetch_images = function(ids) {

        var id = ids.pop();

        if(!id) {
            
            return finalize();

        }

        redis.hgetall(id.toString() + 'a', function(err, reply) {

            zip.file(id + '.jpg', fs.readFileSync(reply.file), {
                comment: reply.label
            });

            fetch_images(ids);

        });

    }

    var finalize = function() {

        var generated_zip = zip.generate({type: "nodebuffer"});

        res.writeHead(200, {'content-type': 'application/zip'});
        res.write(generated_zip);
        res.end();

    }

    console.log('request for data:', req.body.ids);

    fetch_images(req.body.ids);

});

app.get('/upload', function (req, res) {
    
    res.render('index', { title: 'Hey', message: 'Hello there!'});

});

app.post('/upload', function (req, res) {

    var return_ids = [];

    var opop = function(obj) {
        for (var key in obj) {
            // Uncomment below to fix prototype problem.
            // if (!Object.hasOwnProperty.call(obj, key)) continue;
            var result = obj[key];
            // If the property can't be deleted fail with an error.
            if (!delete obj[key]) { throw new Error(); }
            return result;
        } 
    }

    var process_zip_files = function(files) {

        var file = opop(files);
        var extension;

        if(!file) {
            return finalize();
        }

        extension = file.name.split('.');

        names = file.name.split('/');
        name = names[names.length-2];

        if(extension.length == 1 || 
            (extension[0] == '' && extension.length == 2)
        ) {
           return process_zip_files(files);
        }

        extension = extension.pop().toLowerCase();

        if(! (extension == 'jpeg' || extension == 'jpg')) {
            return process_zip_files(files);
        }

        redis.incr('counter', function(err, reply) {

            return_ids.push(reply);

            fs.writeFile(UPLOAD_DIR + reply, file.asNodeBuffer(), function(err) {
                if(err) {
                    console.log(err);
                }

                redis.hmset(reply + 'a', {
                    "file": UPLOAD_DIR + reply, 
                    "label": name
                });

                return process_zip_files(files);

            });

        });

    }

    var finalize = function() {

        redis.get('counter', function(reply, reply) {

            res.writeHead(200, {'content-type': 'application/json'});
            res.end(JSON.stringify({ ids: return_ids }));

        });

    }

    var form = new formidable.IncomingForm();
    form.uploadDir = __dirname + '/uploads_raw/';
    form.multiples = true;

    form.parse(req, function(err, fields, files) {

        fs.readFile(files.upload.path, function(err, data) {
            if(err) throw err;
            var zip = new jszip(data);

            process_zip_files(zip.files);
            
        });

        fs.unlinkSync(files.upload.path);

    });

});


app.listen(8001)