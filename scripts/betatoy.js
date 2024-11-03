const canvas = document.getElementById("canvas");

canvas.getContext("2d").fillStyle = "#000000";
canvas.getContext("2d").fillRect(0, 0, canvas.width, canvas.height);

function linspace(start, end, n) {
    const step = (end - start) / (n - 1);
    const points = [];
    for (let i = 0; i < n; i++) {
        points.push(start + i * step);
    }
    return points;
}

class VCtxt {
    static tweakLims(lims, factor=0.05) {
        const [min, max] = lims;
        const padding = factor * (max - min);
        return [min - padding, max + padding];
    }
    
    constructor(bgColor, fgColor, xLims, yLims, scaleFactor=2) {
        this.bgColor = bgColor;
        this.fgColor = fgColor;
        this.xDomain = xLims;
        this.xLims = VCtxt.tweakLims(xLims);
        this.yLims = VCtxt.tweakLims(yLims);
        this.ctx = canvas.getContext("2d");

        resetCanvas();

        // Scale the canvas
        canvas.style.width = canvas.style.width || canvas.width + 'px';
        canvas.style.height = canvas.style.height || canvas.height + 'px';
        canvas.width = Math.ceil(canvas.width * scaleFactor);
        canvas.height = Math.ceil(canvas.height * scaleFactor);
        this.ctx.scale(scaleFactor, scaleFactor);

        this.width = canvas.width / scaleFactor;
        this.height = canvas.height / scaleFactor;
    }

    yCoord2Pix(y) {
        const [min, max] = this.yLims;
        const percRelativeToAxis = (y - min) / (max - min);
        return this.height * (1 - percRelativeToAxis);
    }

    xCoord2Pix(x) {
        const [min, max] = this.xLims;
        const percRelativeToAxis = (x - min) / (max - min);
        return this.width * percRelativeToAxis;
    }

    coord2Pix(coord) {
        const [x, y] = coord;
        return [this.xCoord2Pix(x), this.yCoord2Pix(y)];
    }

    rawDrawLine(from, to, color, width = 1) {
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = width;
        this.ctx.beginPath();
        this.ctx.moveTo(from[0], from[1]);
        this.ctx.lineTo(to[0], to[1]);
        this.ctx.stroke();
    }

    rawFillRect(origin, dims, color) {
        this.ctx.fillStyle = color;
        this.ctx.fillRect(origin[0], origin[1], dims[0], dims[1]);
    }

    drawLine(from, to, color, width = 1) {
        this.rawDrawLine(this.coord2Pix(from), this.coord2Pix(to), color, width);
    }

    drawAxes(showYAxis = true) {
        this.rawFillRect([0, 0], [this.width, this.height], this.bgColor);

        const [xMin, xMax] = this.xLims;
        const [yMin, yMax] = this.yLims;

        const xAxLoc = (xMin < 0 && xMax > 0) ? 0 : xMin;
        const yAxLoc = (yMin < 0 && yMax > 0) ? 0 : yMin;
        
        if (showYAxis) {
            this.drawLine([xAxLoc, yMin], [xAxLoc, yMax], this.fgColor);
        }
        this.drawLine([xMin, yAxLoc], [xMax, yAxLoc], this.fgColor);

        // Draw ticks
        const xTickLen = 0.01 * (yMax - yMin);
        const yTickLen = 0.01 * (xMax - xMin);
        const xTickDist = 0.1 * (xMax - xMin);
        const yTickDist = 0.1 * (yMax - yMin);
        for (let i = 0; i < 11; i++) {
            const x = xMin + i * xTickDist;
            const y = yMin + i * yTickDist;
            this.drawLine([x, yAxLoc - xTickLen / 2], [x, yAxLoc + xTickLen / 2], this.fgColor);
            if (showYAxis) {
                this.drawLine([xAxLoc - yTickLen / 2, y], [xAxLoc + yTickLen / 2, y], this.fgColor);
            }

            // X-axis labels
            // determine fixedSize based on the xTickDist
            const fixedSize = Math.max(0, Math.ceil(-Math.log10(xTickDist)) + 1 - 2);
            if (x !== 0) {
                const label = `${(x * 100).toFixed(fixedSize)}%`;
                this.ctx.font = "12px Arial";
                this.ctx.fillStyle = this.fgColor;
                this.ctx.textAlign = "center";
                this.ctx.fillText(label, this.xCoord2Pix(x), this.yCoord2Pix(yAxLoc) + 12 + 2);
            }
        }
    }

    drawFunction(f, color, width = 1) {
        const xVals = linspace(this.xDomain[0], this.xDomain[1], 5000);
        const yVals = xVals.map(f);
        const yMax = Math.max(...yVals);
        for (let i = 1; i < xVals.length; i++) {
            this.drawLine([xVals[i - 1], yVals[i - 1]], [xVals[i], yVals[i]], color, width);
        }
    }
}

let lnBetaFnMemory = {};

function lnBetaFn(a, b) {
    const memKey = `${a},${b}`;
    if (memKey in lnBetaFnMemory) {
        return lnBetaFnMemory[memKey];
    }

    let ret = 0.0;
    for (i=0; i<a-2; i++) {
        ret += Math.log(a-1-i);
    }
    for (i=0; i<b-2; i++) {
        ret += Math.log(b-1-i);
    }
    for (i=0; i<a+b-2; i++) {
        ret -= Math.log(a+b-1-i);
    }
    lnBetaFnMemory[memKey] = ret;
    return ret
}

function betaPdf(x, a, b) {
    return Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - lnBetaFn(a, b));
}

function betaProbLessThan(beta1, beta2) {
    const n = 5000;
    const [a1, b1] = beta1;
    const [a2, b2] = beta2;

    const [[xMin, xMax], _] = trimXLim(
        [x => betaPdf(x, a1, b1), x => betaPdf(x, a2, b2)],
        [1/n, 1 - 1/n],
        1000,
        1e-6,
    );
    const dx = (xMax - xMin) / n;

    let prob2gt1 = 0;

    const xs = linspace(xMin, xMax, n);
    const ps1 = xs.map(x => betaPdf(x, a1, b1));
    const ps2 = xs.map(x => betaPdf(x, a2, b2));
    const dx_sqr = dx * dx;

    for (let i1 = 0; i1 < n; i1++) {
        const x1 = xs[i1];
        for (let i2 = 0; i2 < n; i2++) {
            const x2 = xs[i2];
            const p = ps1[i1] * ps2[i2] * dx_sqr;

            if (x2 > x1) {
                prob2gt1 += p;
            }
        }
    }
    return prob2gt1;
}

function trimXLim(fns, xLim, nPoints=1000, significantFactor=1e-4) {
    const [xMin, xMax] = xLim;
    const x = linspace(xMin, xMax, nPoints);
    const yMax = Math.max(...fns.map(fn => Math.max(...x.map(fn))));
    const minSignificantY = significantFactor * yMax;

    // Find the first x value where at least one of the functions is significant.
    let i = 0;
    while (i < nPoints && fns.every(fn => fn(x[i]) < minSignificantY)) {
        i++;
    }
    const newXMin = x[i];

    // Find the last x value where at least one of the functions is significant.
    let j = nPoints - 1;
    while (j >= 0 && fns.every(fn => fn(x[j]) < minSignificantY)) {
        j--;
    }
    const newXMax = x[j];


    return [[newXMin, newXMax], [minSignificantY, yMax]];
}

function plotBetaPdfComparison(beta1, beta2) {
    let [xLims, _] = trimXLim(
        [x => betaPdf(x, ...beta1), x => betaPdf(x, ...beta2)],
        [0.0001, 0.9999],
        2000,
        1e-8,
    );

    // Recompute yMax within points on xLims instead to make sure we get the mode
    const xs = linspace(xLims[0], xLims[1], 1000);
    const ps1 = xs.map(x => betaPdf(x, ...beta1));
    const ps2 = xs.map(x => betaPdf(x, ...beta2));
    const yMax = Math.max(...ps1, ...ps2);
    console.log(yMax, xLims);

    const vCtxt = new VCtxt("#000000", "#FFFFFF", xLims, [0, yMax]);
    vCtxt.drawAxes(showYAxis=false);
    vCtxt.drawFunction(x => betaPdf(x, ...beta1), "#FF0000", 1);
    vCtxt.drawFunction(x => betaPdf(x, ...beta2), "#00FF00", 1);
}

function compareBetaButton() {
    const n1 = parseInt(document.getElementById("n1").value);
    const pos1 = parseFloat(document.getElementById("pos1").value);
    const n2 = parseInt(document.getElementById("n2").value);
    const pos2 = parseFloat(document.getElementById("pos2").value);

    const neg1 = n1 - pos1;
    const neg2 = n2 - pos2;

    const [a1, b1] = [pos1 + 1, neg1 + 1];
    const [a2, b2] = [pos2 + 1, neg2 + 1];

    plotBetaPdfComparison([a1, b1], [a2, b2]);

    const prob2gt1 = betaProbLessThan([a1, b1], [a2, b2]);
    document.getElementById("pr_a_gt_b").innerHTML = (prob2gt1 * 100).toFixed(1) + "%";
}

function resetCanvas() {
    const ctxt = canvas.getContext("2d");
    ctxt.clearRect(0, 0, canvas.width, canvas.height);
    canvas.width = canvas.style.width.replace("px", "") || canvas.width;
    canvas.height = canvas.style.height.replace("px", "") || canvas.height;
    ctxt.fillStyle = "#000000";
    ctxt.fillRect(0, 0, canvas.width, canvas.height);
}

function reset() {
    resetCanvas();
}
