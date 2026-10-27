<?php
/**
 * Plugin Name: ListSnap local test store
 * Description: Lets this local test store download product images from the app on
 * the host machine (host.docker.internal:3000). WordPress refuses private addresses and
 * ports other than 80, 443 and 8080 by default; a real store fetches from the public
 * app URL and never needs this.
 */
add_filter( 'http_request_host_is_external', '__return_true' );
add_filter(
	'http_allowed_safe_ports',
	function ( $ports ) {
		return array_merge( $ports, array( 3000, 3001 ) );
	}
);
