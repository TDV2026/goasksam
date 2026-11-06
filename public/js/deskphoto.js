/* DESK PHOTO SHRINK (Lane D, Nov 2026). The one thing the New valuation form does with a picture: draw it smaller in the browser (long edge 1600) and hand back JPEG base64, so the upload is small.
   It makes no figure for the sheet; the server checks it is a photo and resizes it the way an emailed one is. Kept apart from deskvals.js, which prints and computes nothing. */
window.deskShrink = function (file) {
  return new Promise(function (res) {
    var img = new Image(), url = URL.createObjectURL(file);
    img.onload = function () {
      var k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", 0.85).split(",")[1]);
    };
    img.onerror = function () { URL.revokeObjectURL(url); res(null); }; img.src = url;
  });
};
