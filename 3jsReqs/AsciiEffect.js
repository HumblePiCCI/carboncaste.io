/**
 * Ascii generation is based on https://github.com/hassadee/jsascii/blob/master/jsascii.js
 *
 * 16 April 2012 - @blurspline
 */

class AsciiEffect {

	constructor( renderer, charSet = ' .;!*t@#W■', options = {} ) {

		// ' .,:;=|iI+hHOE#`$';
		// darker bolder character set from https://github.com/saw/Canvas-ASCII-Art/
		// ' .\'`^",:;Il!i~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$'.split('');

		// Some ASCII settings

		const fResolution = options[ 'resolution' ] || 0.15; // Higher for more details
		const bInvert = options[ 'invert' ] || false; // black is white, white is black

		let width, height;

		const domElement = document.createElement( 'div' );

		const oAscii = document.createElement( 'table' );
		oAscii.className = 'ascii-table';
		domElement.appendChild( oAscii );

		let iWidth, iHeight;

		this.setSize = function ( w, h ) {

			width = w;
			height = h;

			renderer.setSize( w, h, false );

			initAsciiSize();

		};


		this.render = function ( scene, camera ) {

			renderer.render( scene, camera );
			asciifyImage( oAscii );

		};

		this.domElement = domElement;


		// Throw in ascii library from https://github.com/hassadee/jsascii/blob/master/jsascii.js (MIT License)

		function initAsciiSize() {

			iWidth = Math.floor( width * fResolution );
			iHeight = Math.floor( height * fResolution );

			oCanvas.width = iWidth;
			oCanvas.height = iHeight;

			oAscii.cellSpacing = 0;
			oAscii.cellPadding = 0;

		}


		const aDefaultCharList = ( ' .,:;i1tfLCG08@' ).split( '' );
		const oCanvasImg = renderer.domElement;

		const oCanvas = document.createElement( 'canvas' );
		if ( ! oCanvas.getContext ) {

			return;

		}

		const oCtx = oCanvas.getContext( '2d', { willReadFrequently: true } );
		if ( ! oCtx.getImageData ) {

			return;

		}

		let aCharList = aDefaultCharList;

		if ( charSet ) aCharList = charSet;

		// Setup dom

		// can't get a span or div to flow like an img element, but a table works?


		// convert img element to ascii

		function asciifyImage( oAscii ) {

			oCtx.clearRect( 0, 0, iWidth, iHeight );
			oCtx.drawImage( oCanvasImg, 0, 0, iWidth, iHeight );
			const oImgData = oCtx.getImageData( 0, 0, iWidth, iHeight ).data;

			// Coloring loop starts now
			let strChars = '';

			// console.time('rendering');

			for ( let y = 0; y < iHeight; y += 2 ) {

				for ( let x = 0; x < iWidth; x ++ ) {

					const iOffset = ( y * iWidth + x ) * 4;

					const iRed = oImgData[ iOffset ];
					const iGreen = oImgData[ iOffset + 1 ];
					const iBlue = oImgData[ iOffset + 2 ];
					const iAlpha = oImgData[ iOffset + 3 ];
					let iCharIdx;

					let fBrightness;

					fBrightness = ( 0.3 * iRed + 0.59 * iGreen + 0.11 * iBlue ) / 255;
					// fBrightness = (0.3*iRed + 0.5*iGreen + 0.3*iBlue) / 255;

					if ( iAlpha == 0 ) {

						// should calculate alpha instead, but quick hack :)
						//fBrightness *= (iAlpha / 255);
						fBrightness = 1;

					}

					iCharIdx = Math.floor( ( 1 - fBrightness ) * ( aCharList.length - 1 ) );

					if ( bInvert ) {

						iCharIdx = aCharList.length - iCharIdx - 1;

					}

					// good for debugging
					//fBrightness = Math.floor(fBrightness * 10);
					//strThisChar = fBrightness;

					let strThisChar = aCharList[ iCharIdx ];

					if ( strThisChar === undefined || strThisChar == ' ' )
						strThisChar = '&nbsp;';

					strChars += strThisChar;

				}

				strChars += '<br/>';

			}

			oAscii.innerHTML = `<tr><td>${strChars}</td></tr>`;

			// console.timeEnd('rendering');

			// return oAscii;

		}

	}

}

export { AsciiEffect };
