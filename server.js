//  OpenShift sample Node application
var express = require('express'),
    app     = express(),
    morgan  = require('morgan');

const ytdl = require('ytdl-core')
const _ = require('lodash')
const async = require('async')

    
Object.assign=require('object-assign')

app.engine('html', require('ejs').renderFile);
app.use(morgan('combined'))

var port = process.env.PORT || process.env.OPENSHIFT_NODEJS_PORT || 8080,
    ip   = process.env.IP   || process.env.OPENSHIFT_NODEJS_IP || '0.0.0.0',
    mongoURL = process.env.OPENSHIFT_MONGODB_DB_URL || process.env.MONGO_URL,
    mongoURLLabel = "";

if (mongoURL == null) {
  var mongoHost, mongoPort, mongoDatabase, mongoPassword, mongoUser;
  // If using plane old env vars via service discovery
  if (process.env.DATABASE_SERVICE_NAME) {
    var mongoServiceName = process.env.DATABASE_SERVICE_NAME.toUpperCase();
    mongoHost = process.env[mongoServiceName + '_SERVICE_HOST'];
    mongoPort = process.env[mongoServiceName + '_SERVICE_PORT'];
    mongoDatabase = process.env[mongoServiceName + '_DATABASE'];
    mongoPassword = process.env[mongoServiceName + '_PASSWORD'];
    mongoUser = process.env[mongoServiceName + '_USER'];

  // If using env vars from secret from service binding  
  } else if (process.env.database_name) {
    mongoDatabase = process.env.database_name;
    mongoPassword = process.env.password;
    mongoUser = process.env.username;
    var mongoUriParts = process.env.uri && process.env.uri.split("//");
    if (mongoUriParts.length == 2) {
      mongoUriParts = mongoUriParts[1].split(":");
      if (mongoUriParts && mongoUriParts.length == 2) {
        mongoHost = mongoUriParts[0];
        mongoPort = mongoUriParts[1];
      }
    }
  }

  if (mongoHost && mongoPort && mongoDatabase) {
    mongoURLLabel = mongoURL = 'mongodb://';
    if (mongoUser && mongoPassword) {
      mongoURL += mongoUser + ':' + mongoPassword + '@';
    }
    // Provide UI label that excludes user id and pw
    mongoURLLabel += mongoHost + ':' + mongoPort + '/' + mongoDatabase;
    mongoURL += mongoHost + ':' +  mongoPort + '/' + mongoDatabase;
  }
}
var db = null,
    dbDetails = new Object();

var initDb = function(callback) {
  if (mongoURL == null) return;

  var mongodb = require('mongodb');
  if (mongodb == null) return;

  mongodb.connect(mongoURL, function(err, conn) {
    if (err) {
      callback(err);
      return;
    }

    db = conn;
    dbDetails.databaseName = db.databaseName;
    dbDetails.url = mongoURLLabel;
    dbDetails.type = 'MongoDB';

    console.log('Connected to MongoDB at: %s', mongoURL);
  });
};

app.get('/', function (req, res) {
  // try to initialize the db on every request if it's not already
  // initialized.
  return res.json({
      success: true,
      response: "hi there"
  })
});

app.get('/pagecount', function (req, res) {
  // try to initialize the db on every request if it's not already
  // initialized.
  if (!db) {
    initDb(function(err){});
  }
  if (db) {
    db.collection('counts').count(function(err, count ){
      res.send('{ pageCount: ' + count + '}');
    });
  } else {
    res.send('{ pageCount: -1 }');
  }
});

app.get('/getInfo', (req, res) => {
    ytdl.getInfo(req.query.id, (err, info) => {
        if (err) {
            return res.json({
                success: false,
                response: err
            })
        }

        const song = extractSong(info)

        res.json({
            success: true,
            response: song
        })

    })
})

const extractSong = (info) => {
    const fullTitle = _.get(info, 'player_response.videoDetails.title')
    const titleAuthor = fullTitle.split(' - ')
    const author = titleAuthor[0]
    let title = titleAuthor[1]
    if(title) {
        title = title.replace(/ *\([^)]*\) */g, "")
        title = title.replace(/ *\[[^\]]*]/, '')
    }

    const length = _.get(info, 'player_response.videoDetails.lengthSeconds')
    const thumbnail = _.get(info, 'player_response.videoDetails.thumbnail.thumbnails[3].url')
    const format = ytdl.chooseFormat(info.formats, { quality: '140' })




    const song = {
        title: title,
        author: author,
        length: length,
        thumbnail: thumbnail,
        url: format.url
    }

    return song
}

app.get('/getInfoPlayNow', (req, res) => {
    ytdl.getInfo(req.query.id, (err, info) => {

        if (err) {
            return res.json({
                success: false,
                response: err
            })
        }

        var relatedVideos = info.related_videos

        var songs = [extractSong(info)];
        for (var i=0; i<relatedVideos.length; i++){
            var id= relatedVideos[i].id || relatedVideos[i].video_id
            if(id) {
                ytdl.getInfo(id, (err, info) => {
                    if (err) {
                        return res.json({
                            success: false,
                            response: err
                        })
                    }

                    songs.push(extractSong(info))
                    if(i === songs.length - 1) {
                        res.send(songs)
                    }
                })
            }

        }
    })
})

var asyncParallel = function(tasks, callback) {
    var results = [];
    var count = tasks.length;
    tasks.forEach(function(task, index) {
        task(function(err, data) {
            results[index] = data;
            if (err) {
                callback && callback(err);
                callback = null;
            }
            if (--count === 0 && callback) {
                callback(null, results);
            }
        });
    });
};

app.get('/getInfoList', (req, res) => {
    console.log("1")
    var arr = JSON.parse(req.query.array);

    var songs = [];
    var stack = []
    for (var i=0; i<arr.length; i++){
        stack.push(function (cb) {
            ytdl.getInfo(arr[i], cb)
        })
        async.parallel(stack, function(err, result) {
            if (err) {
                return res.json({
                    success: false,
                    response: err
                })
            }

            if(i === result.length) {
                return res.send(result)
            }

        });
    }



})

// error handling
app.use(function(err, req, res, next){
  console.error(err.stack);
  res.status(500).send('Something bad happened!');
});

initDb(function(err){
  console.log('Error connecting to Mongo. Message:\n'+err);
});

app.listen(port, ip);
console.log('Server running on http://%s:%s', ip, port);

module.exports = app ;
