//webkitURL is deprecated but nevertheless
URL = window.URL || window.webkitURL;

var gumStream; //stream from getUserMedia()
var rec; //Recorder.js object
var input; //MediaStreamAudioSourceNode we'll be recording

// shim for AudioContext when it's not avb. 
var AudioContext = window.AudioContext || window.webkitAudioContext;
var audioContext //audio context to help us record

var token;
var username;
var userPromptExist = false;
var promptId;
var language = "zh-hk";
var resources, currentResource, hotlines;
var mediaUri = null;
var uploadUri = null;
var recordedBlob;

var dataTableName = "Hotline for Greeting Recording";

var recordButton = document.getElementById("recordButton");
var stopButton = document.getElementById("stopButton");
// var pauseButton = document.getElementById("pauseButton");
var uploadButton = document.getElementById("uploadButton");
var cantoneseButton = document.getElementById("cantoneseButton");
var englishButton = document.getElementById("englishButton");
var mandarinButton = document.getElementById("mandarinButton");
var hotlinesSelection = document.getElementById("hotlines");

//add events to those 2 buttons
recordButton.addEventListener("click", startRecording);
stopButton.addEventListener("click", stopRecording);
// pauseButton.addEventListener("click", pauseRecording);
cantoneseButton.addEventListener("click", function() {
    changeLanguage("zh-hk");
});
englishButton.addEventListener("click", function() {
    changeLanguage("en-ca");
});
mandarinButton.addEventListener("click", function() {
    changeLanguage("zh-sg");
});
uploadButton.addEventListener("click", function() {
    uploadRecording(recordedBlob);
});
hotlinesSelection.addEventListener("change", function(){
    console.log($("#hotlines").val());
});


if (window.location.hash) {
    token = getParameterByName('access_token');
    getGreetingHotlineInfo();
    getUsernameAndResources();

} else {
    // Obtain a reference to the platformClient object
    const platformClient = require('platformClient');
    const client = platformClient.ApiClient.instance;
    client.setEnvironment(platformClient.PureCloudRegionHosts.ap_northeast_1);
//    client.loginImplicitGrant('520c275f-2aeb-47b2-a4cb-34dc33cbccb9', 'https://webpage-hosting.s3-ap-northeast-1.amazonaws.com/agentgreeting/index.html');
    client.loginImplicitGrant('5b160eca-cece-4ec4-b3fa-dfafdc7e9a6f', 'https://brianywh.github.io/greeting-recorder/index.html');
}

function startRecording() {
    console.log("recordButton clicked");

    /*
        Simple constraints object, for more advanced audio features see
        https://addpipe.com/blog/audio-constraints-getusermedia/
    */

    var constraints = {
        audio: true,
        video: false
    }

    /*
        Disable the record button until we get a success or fail from getUserMedia() 
    */

    recordButton.disabled = true;
    stopButton.disabled = false;
    // pauseButton.disabled = false
    uploadButton.disabled = true;

    /*
        We're using the standard promise based getUserMedia() 
        https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
    */

    navigator.mediaDevices.getUserMedia(constraints).then(function(stream) {
        console.log("getUserMedia() success, stream created, initializing Recorder.js ...");

        /*
            create an audio context after getUserMedia is called
            sampleRate might change after getUserMedia is called, like it does on macOS when recording through AirPods
            the sampleRate defaults to the one set in your OS for your playback device

        */
        audioContext = new AudioContext();

        //update the format 
        //document.getElementById("formats").innerHTML="Format: 1 channel pcm @ "+audioContext.sampleRate/1000+"kHz"

        /*  assign to gumStream for later use  */
        gumStream = stream;

        /* use the stream */
        input = audioContext.createMediaStreamSource(stream);

        /* 
            Create the Recorder object and configure to record mono sound (1 channel)
            Recording 2 channels  will double the file size
        */
        rec = new Recorder(input, {
            numChannels: 1
        })

        //start the recording process
        rec.record()

        $('#recordingsList').empty();

        console.log("Recording started");

    }).catch(function(err) {
        //enable the record button if getUserMedia() fails
        recordButton.disabled = false;
        stopButton.disabled = true;
        // pauseButton.disabled = true
    });
}

/* function pauseRecording(){
    console.log("pauseButton clicked rec.recording=",rec.recording );
    if (rec.recording){
        // pause
        rec.stop();
        pauseButton.innerHTML="Resume";
    }else{
        // resume
        rec.record()
        pauseButton.innerHTML="Pause";

    }
} */

function stopRecording() {
    console.log("stopButton clicked");

    //disable the stop button, enable the record too allow for new recordings
    stopButton.disabled = true;
    recordButton.disabled = false;
    // pauseButton.disabled = true;

    //reset button just in case the recording is stopped while paused
    // pauseButton.innerHTML="Pause";

    //tell the recorder to stop the recording
    rec.stop();

    //stop microphone access
    gumStream.getAudioTracks()[0].stop();

    //create the wav blob and pass it on to createDownloadLink
    rec.exportWAV(createDownloadLink);
}

function createDownloadLink(blob) {

    console.log(blob);
    recordedBlob = blob;
    var url = URL.createObjectURL(blob);
    var au = document.createElement('audio');
    var li = document.createElement('li');
    // var link = document.createElement('a');

    //name of .wav file to use during upload and download (without extendion)
    // var filename = new Date().toISOString();

    //add controls to the <audio> element
    au.controls = true;
    au.id = "recordedAudio";
    au.src = url;

    //add the new audio element to li
    li.appendChild(au);
    uploadButton.disabled = false;

    //add the li element to the ol
    recordingsList.appendChild(li);
}

function getParameterByName(name) {
    name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
    var regex = new RegExp("[\\#&]" + name + "=([^&#]*)"),
        results = regex.exec(location.hash);
    return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
}

function changeLanguage(selectedLanguage) {
    language = selectedLanguage;

    if (language === "zh-hk") {
        $("#cantoneseButton").addClass('selectedButton');
        $("#englishButton").removeClass('selectedButton');
        $("#mandarinButton").removeClass('selectedButton');
    } else if (language === "en-ca") {
        $("#cantoneseButton").removeClass('selectedButton');
        $("#englishButton").addClass('selectedButton');
        $("#mandarinButton").removeClass('selectedButton');
    } else {
        $("#cantoneseButton").removeClass('selectedButton');
        $("#englishButton").removeClass('selectedButton');
        $("#mandarinButton").addClass('selectedButton');
    }

    $('#recordingsList').empty();
    uploadButton.disabled = true;
    if (userPromptExist == true) {
        getUri();
    }
}

function getUsernameAndResources() {
    $.ajax({
        url: "https://api.mypurecloud.jp/api/v2/users/me",
        type: "GET",
        beforeSend: function(xhr) {
            xhr.setRequestHeader('Authorization', 'bearer ' + token);
        },
        success: function(data) {
            console.log(data.username);
            username = data.username;
            // username = "test.agent@hkbn.com.hk";
            getResources(username);
        }
    });
}

function getGreetingHotlineInfo() {
    $.ajax({
        url: "https://api.mypurecloud.jp/api/v2/flows/datatables?name=" + dataTableName,
        type: "GET",
        beforeSend: function(xhr) {
            xhr.setRequestHeader('Authorization', 'bearer ' + token);
        },
        success: function(data) {
            if (data.total > 0) {
                var id = data.entities[0].id;
                getGreetingParameters(id);
            }
            // table no defined, only general hotline exists
        }
    });
}

function getGreetingParameters(id) {
    $.ajax({
        url: "https://api.mypurecloud.jp/api/v2/flows/datatables/" + id + "/rows/?showbrief=false",
        type: "GET",
        beforeSend: function(xhr) {
            xhr.setRequestHeader('Authorization', 'bearer ' + token);
        },
        success: function(data) {
            if (data.total > 0) {
                hotlines = data.entities;
                Object.keys(hotlines).forEach(key => {
                    console.log(key, hotlines[key].Name);
                    var option = $("<option />");
                    option.html(hotlines[key].Name);
                    option.val(hotlines[key].key);
                    $("#hotlines").append(option);
                });
            }
        }
    });
}

function getResources(username) {
    $.ajax({
        url: "https://api.mypurecloud.jp/api/v2/architect/prompts?nameOrDescription=" + username,
        type: "GET",
        beforeSend: function(xhr) {
            xhr.setRequestHeader('Authorization', 'bearer ' + token);
        },
        success: function(data) {
            if (data.total > 0) {
                userPromptExist = true;
                promptId = data.entities[0].id;
                resources = data.entities[0].resources;
                getUri();
                console.log(mediaUri);
                console.log(uploadUri);
            } else {
                userPromptExist = false;
                console.log("User prompt does not exist.");
                document.getElementById("currentAudio").style.height = "0";
                document.getElementById("noPromptBanner").style.fontSize = "large";
            }
        }
    });
}

function getUri() {
    mediaUri = null;
    uploadUri = null;

    currentResource = resources.find(output => output.id === language);
    if (currentResource != null) {
        mediaUri = currentResource.mediaUri;
        uploadUri = currentResource.uploadUri;
    }

    if (mediaUri) {
        // $("#currentAudio").attr("src", mediaUri);
        document.getElementById("currentAudio").src = mediaUri;
        document.getElementById("currentAudio").style.height = "revert";
        document.getElementById("noPromptBanner").style.fontSize = "0";
    } else {
        document.getElementById("currentAudio").style.height = "0";
        document.getElementById("noPromptBanner").style.fontSize = "large";
    }
}

function uploadRecording(blob) {

    if (userPromptExist == false) {
        createUserPrompt(blob);
    } else if (userPromptExist == true && uploadUri == null) {
        if (promptId != null) {
            createPromptResource(blob);
        }
    } else if (userPromptExist == true && uploadUri != null) {
        uploadPromptResource(blob);
    }
}

function createUserPrompt(blob) {
    var selectedIndex = $("#hotlines").val();
    var suffix = hotlines.find(x => x.key === selectedIndex);
console.log(selectedIndex);
console.log(hotlines);
console.log(suffix);

//    var suffix = hotlines.find(x => x.key === selectedIndex).Suffix;

//    if (!suffix)
//        suffix = "_" + suffix;

    $.ajax({
        url: "https://api.mypurecloud.jp/api/v2/architect/prompts",
        type: "POST",
        data: JSON.stringify({
            "name": "AgentGreeting_" + username.substr(0, username.indexOf('@')).replace(/[^a-zA-Z0-9 ]/g, ""),// + suffix,
            "description": username
        }),
        processData: false,
        contentType: "application/json",
        beforeSend: function(xhr) {
            xhr.setRequestHeader('Authorization', 'bearer ' + token);
        },
        success: function(data) {
            console.log("User prompt created.");
            console.log("Prompt Id:	" + data.id);
            userPromptExist = true;
            promptId = data.id;
            createPromptResource(blob);
        }
    });
}

function createPromptResource(blob) {
    $.ajax({
        url: "https://api.mypurecloud.jp/api/v2/architect/prompts/" + promptId + "/resources",
        type: "POST",
        data: JSON.stringify({
            "language": language
        }),
        processData: false,
        contentType: "application/json",
        beforeSend: function(xhr) {
            xhr.setRequestHeader('Authorization', 'bearer ' + token);
        },
        success: function(data) {
            console.log("Prompt resource created.");
            console.log("Upload Uri:	" + data.uploadUri);
            uploadUri = data.uploadUri;
            uploadPromptResource(blob)
        }
    });
}

function uploadPromptResource(blob) {

    var fd_blob = new FormData();
    fd_blob.append('file', blob);

    $.ajax({
        url: uploadUri,
        type: "POST",
        data: fd_blob,
        processData: false,
        contentType: false,
        beforeSend: function(xhr) {
            xhr.setRequestHeader('Authorization', 'bearer ' + token);
        },
        success: function(data) {

            setTimeout(
                function() {
                    console.log("Recording uploaded");
                    rec.clear();
                    console.log(document.getElementById("recordedAudio").src);
                    URL.revokeObjectURL(document.getElementById("recordedAudio").src);
                    getResources(username);
                }, 1000);

        }
    });
}