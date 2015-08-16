/**
 * Created by kokdemo on 15/8/16.
 */
function rgb2hsb(rgb) {
    // r,g,b values are from 0 to 1
    // h = [0,360], s = [0,1], v = [0,1]
    // if s == 0, then h = -1 (undefined)
    var min, max, delta, tmp, hsv = [];
    min = Math.min(rgb[0], rgb[1], rgb[2]);
    max = Math.max(rgb[0], rgb[1], rgb[2]);
    hsv[2] = max; // value
    delta = max - min;
    if (max != 0) {
        hsv[1] = delta / max; // s
    } else {
        // r = g = b = 0 // s = 0, v is undefined white
        hsv[1] = 0;
        hsv[0] = -1;
        return hsv
    }
    if (rgb[0] == max) {
        hsv[0] = ( rgb[1] - rgb[2] ) / delta; // between yellow & magenta
    } else if (rgb[1] == max) {
        hsv[0] = 2 + ( rgb[2] - rgb[0] ) / delta; // between cyan & yellow
    } else {
        hsv[0] = 4 + ( rgb[0] - rgb[1] ) / delta; // between magenta & cyan
    }
    hsv[0] = hsv[0] * 60; // degrees
    if (hsv[0] < 0) hsv[0] += 360;
    return hsv
}
function hsb2rgb(hsv) {
    var f, p, q, t, i;
    var H = hsv[0], S = hsv[1], V = hsv[2];
    var R, G, B;
    if (S == 0) {
        // achromatic (grey)
        R = G = B = V;
        return;
    }
    H = H / 60; // sector 0 to 5
    i = Math.floor(H);
    f = H - i; // factorial part of h
    p = Math.ceil(V * ( 1 - S ));
    q = Math.ceil(V * ( 1 - S * f ));
    t = Math.ceil(V * ( 1 - S * ( 1 - f ) ));
    switch (i) {
        case 0:
            R = V;
            G = t;
            B = p;
            break;
        case 1:
            R = q;
            G = V;
            B = p;
            break;
        case 2:
            R = p;
            G = V;
            B = t;
            break;
        case 3:
            R = p;
            G = q;
            B = V;
            break;
        case 4:
            R = t;
            G = p;
            B = V;
            break;
        default: // case 5:
            R = V;
            G = p;
            B = q;
            break;
    }
    return [R, G, B]
}

var color = new Vue({
    el: 'body',
    data: {
        step: 0,
        baseColors: [
            {r: "f4", g: "43", b: "36", name: "red"},
            {r: "e9", g: "1e", b: "63", name: "pink"},
            {r: "9c", g: "27", b: "b0", name: "purple"},
            {r: "67", g: "3a", b: "b7", name: "deep-purple"},
            {r: "3f", g: "51", b: "b5", name: "indigo"},
            {r: "21", g: "96", b: "f3", name: "blue"},
            {r: "03", g: "a9", b: "f4", name: "light-blue"},
            {r: "00", g: "bc", b: "d4", name: "cyan"},
            {r: "00", g: "96", b: "88", name: "teal"},
            {r: "4c", g: "af", b: "50", name: "green"},
            {r: "8b", g: "c3", b: "4a", name: "light-green"},
            {r: "cd", g: "dc", b: "39", name: "lime"},
            {r: "ff", g: "eb", b: "3b", name: "yellow"},
            {r: "ff", g: "c1", b: "07", name: "amber"},
            {r: "ff", g: "98", b: "00", name: "orange"},
            {r: "ff", g: "57", b: "22", name: "deep-orange"},
            {r: "79", g: "55", b: "48", name: "brown"},
            {r: "60", g: "7d", b: "8b", name: "blue-grey"}
        ],
        colorExpand: {
            Comple: [],
            Brightness: [],
            Hue: [],
            Saturation: [],
            List: [],
            Gray: [],
            History: []
        }
    },
    methods: {
        choose: function (colors, p) {
            this.$data.step = 1;
            var rgb = [];
            if (p == 16) {
                rgb[0] = parseInt(colors.r, 16);
                rgb[1] = parseInt(colors.g, 16);
                rgb[2] = parseInt(colors.b, 16);
            } else {
                rgb = colors;
            }
            var hsb = rgb2hsb(rgb);
            //色相 饱和度 亮度
            var hue = [];
            hue.push((hsb[0] + 360 - 60) % 360);
            hue.push((hsb[0] + 360 - 30) % 360);
            hue.push((hsb[0] + 360 - 0) % 360);
            hue.push((hsb[0] + 360 + 30) % 360);
            hue.push((hsb[0] + 360 + 60) % 360);
            this.$data.colorExpand.Hue.length = 0;
            for (var i = 0; i < hue.length; i++) {
                this.$data.colorExpand.Hue.push(hsb2rgb([hue[i], hsb[1], hsb[2]]));
            }
            var brightness = [];
            var border = function (x, min, max) {
                if (x < min) {
                    x = min;
                }
                if (x > max) {
                    x = max;
                }
                return x
            };
            brightness.push(border(hsb[2] + 50, 0, 255));
            brightness.push(border(hsb[2] + 25, 0, 255));
            brightness.push(border(hsb[2] - 0, 0, 255));
            brightness.push(border(hsb[2] - 25, 0, 255));
            brightness.push(border(hsb[2] - 50, 0, 255));
            this.$data.colorExpand.Brightness.length = 0;
            for (var i = 0; i < brightness.length; i++) {
                this.$data.colorExpand.Brightness.push(hsb2rgb([hsb[0], hsb[1], brightness[i]]));
            }
            var gray = [];
            gray.push(border(hsb[2] + 50, 0, 255));
            gray.push(border(hsb[2] + 25, 0, 255));
            gray.push(border(hsb[2] - 0, 0, 255));
            gray.push(border(hsb[2] - 25, 0, 255));
            gray.push(border(hsb[2] - 50, 0, 255));
            this.$data.colorExpand.Gray.length = 0;
            for (var i = 0; i < gray.length; i++) {
                this.$data.colorExpand.Gray.push([gray[i], gray[i], gray[i]]);
            }
            this.$data.colorExpand.Comple = [255 - rgb[0], 255 - rgb[1], 255 - rgb[2]];
            var len = this.$data.colorExpand.History.length;
            if (len < 5) {
                this.$data.colorExpand.History.push(rgb);
            } else {
                this.$data.colorExpand.History.shift();
                this.$data.colorExpand.History.push(rgb);
            }
        },
        deleteColor: function (color, $index) {
            console.info($index);
            this.$data.colorExpand.List.splice($index, 1);
        },
        list: function (color, e) {
            var cloneObj = JSON.parse(JSON.stringify(color));
            console.info(cloneObj);
            var len = this.$data.colorExpand.List.length;
            if (len < 5) {
                this.$data.colorExpand.List.push(cloneObj);
            } else {
                console.info(this.$data.colorExpand.List);
                this.$data.colorExpand.List.shift();
                this.$data.colorExpand.List.push(cloneObj);
            }
            e.stopPropagation();
            return false
        },
        string16: function (number) {
            var x = number.toString(16);
            if (x.length == 1) {
                return '0' + x
            } else {
                return x
            }
        },
        changeStep: function (num) {
            this.$data.step = num;
        }
    }
});