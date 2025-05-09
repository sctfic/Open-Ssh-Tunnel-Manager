#!/usr/bin/env bash

### BEGIN INIT INFO
# Provides:          mast
# Required-Start:    $network $local_fs $remote_fs $syslog
# Required-Stop:     $network $remote_fs $syslog
# Default-Start:     2 3 4 5
# Default-Stop:      0 1 6
# Short-Description: Daemon to manage multiple auto-ssh tunnels
# Description:       Daemon to manage multiple auto-ssh tunnels
### END INIT INFO

# Author: Édouard Lopez <srv+mast@edouard-lopez.com>

# Copyright 2014 - Édouard Lopez - http://edouard-lopez.com/
#
# This script is free software; you can redistribute it and/or modify it under
# the terms of the GNU General Public License as published by the Free Software
# Foundation; either version 3 of the License, or (at your option) any later
# version.
#
# This script is distributed in the hope that it will be useful, but WITHOUT
# ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
# FOR A PARTICULAR PURPOSE. See the GNU General Public License for more
# details at http://www.gnu.org/licenses/.

# see: http://surniaulula.com/2012/12/10/autossh-startup-script-for-multiple-tunnels/
# Exit script if you try to use an uninitialised variable.
# @alias: set -u
# set -o nounset
# Exit script if any statement returns a non-true return value.
# @alias: set -e
# set -o errexit

# Import function library
source /lib/lsb/init-functions

NAME=mast
autossh="$(which autossh)"
# template name for log file
LOG_DIR="/var/log/$NAME"
# Required at boot
LOCK_DIR="/var/lock/$NAME"
# SSH tunnel configuration directory (a file per host)
CONFIG_DIR="/etc/$NAME"
PID_DIR="/var/run/$NAME"

# fixme: We can't get a exit status so we wait ~5s before considering start failed
declare -i MAX_LATENCY=5;
# Default is to set a transfert limit of 10^9 Kilo/s ~ 10 Tera/s
declare -i NO_TRANSFERT_LIMIT=$((10**9))

# Create PID directory missing
# /var/run/"$NAME" and /var/lock/"$NAME" are created by the makefile

# Constants
SUCCESS_STATUS=0 # used in 'return'
ABORT_STATUS=1 # used in 'return'

# debug mode (need to `export DEBUG='true'` and run as `sudo -E`, see docs/installation.md)
[[ -n $DEBUG ]] && set -x


# - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
#                                                    STDOUT FORMATTING
# - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

# Styling function
# formatting
_underline_="$(tput sgr 0 1)"	# Underline
_bold_="$(tput bold)"			# Bold
_reset_="$(tput sgr0)"			# Reset
# coloring
_info_="$(tput setaf 6)"		# blue/information
_warning_="$(tput setaf 3)"	# yellow/warning
_error_="$(tput setaf 1)"		# red/error
_log_="$(tput setaf 7)"			# value/white
_debug_="$(tput setaf 7)"			# value/white
_value_="$(tput setaf 5)"		# value/purple
_valid_="$(tput setaf 2)"		# valid/green
# helpers
_underline()	{ printf "${_underline_}%s${_reset_}" "$*"; } 			# style text as underline
_bold()			{ printf "${_bold_}%s${_reset_}" "$*"; } 				# style text as bold
_info()			{ printf "${_info_}%s${_reset_}" "$*"; } 				# style text as info
_log()			{ printf "${_log_}%s${_reset_}" "$*"; } 				# style text as log
_debug()		{ printf "${_debug_}%s${_reset_}" "$*"; } 				# style text as debug
_warning()		{ printf "${_warning_}%s${_reset_}" "$*"; } 			# style text as warning
_error()			{ printf "${_bold_}${_error_}%s${_reset_}" "$*"; } 	# style text as error
_value()		{ printf "${_value_}%s${_reset_}" "$*"; } 				# style text as value
_valid()			{ printf "${_valid_}%s${_reset_}" "$*"; } 				# style text as valid

# Print message helper
function feedback() {
	what="$1"
	status="$2"
	todo="$3"
	# cfname="$4"

	printf "\t%-48s%s\t%s" \
		"$(_info "$what")" \
		"$(_error "$status")" \
		"$(_debug "$todo")" \
	1>&2 | _log-to "$cfname"
}


# - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
#                                                        UTILITIES
# - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

# Log file path for given config
# @param {string} config name
function _log-file() {
	if [[ -z "$1" ]]; then
		feedback "configuration name"  "$(_warning "required")"  "no configuration's name provided" 1>&2
		exit 1
	else
		echo "$LOG_DIR/$NAME-$1.log"
	fi

	return $SUCCESS_STATUS
}


# Log piped message to stdout and in given config log file.
# @param:	{string} 	$1	configuration filename.
function _log-to() {
	if [[ -z "$1" ]]; then
		# do NOT refactor or get a fork bomb :D!
		printf "\t%s\t%s\t%s\n" \
			"$(_value "configuration name")" \
			"$(_warning "required")" \
			"$(_debug "no configuration's name provided")" \
		1>&2
		exit 1
	fi
	local cfname="$1"
	shift; read msg

	# print to stdout
	printf "%s\n" "$msg"

	# print to log file
	printf "[%s] %s\n" "$(_info "${FUNCNAME[1]}")" "$msg" >> "$(_log-file  "$cfname")"

	return $SUCCESS_STATUS
}


# Make sure we have a config file
# @param:	{string}	$config		configuration filepath.
# @inherit:		{string} 	$cfname	configuration filename.
function check_config_file_exists() {
	local config="$CONFIG_DIR/$1"

	if [[ ! -f "$config" ]]; then
		feedback "$cfname"  "missing"  "no configuration file in $CONFIG_DIR"
		return $ABORT_STATUS
	fi

	return $SUCCESS_STATUS
}


# Make sure all arguments/variables have been defined in config
# @inherit:	{string} 	$cfname		configuration filename.
function check_tunnel_config() {
	sshArguments=( # list of required variables
           Compression
		ServerAliveInterval ServerAliveCountMax StrictHostKeyChecking
		LocalUser IdentityFile RemoteUser RemoteHost RemotePort
		BandwidthLimitation UploadLimit DownloadLimit
	)

	for var in "${sshArguments[@]}"; do
		if [[ -z ${!var} ]]; then # test if each config's variable is empty (e.g. $ServerAliveInterval content)
			feedback "$var"  "undefined"  "no value in $CONFIG_DIR/$cfname"
			return $ABORT_STATUS
		fi
	done

	return $SUCCESS_STATUS
}


# We need at least 1 forward rule to be able to start
# @inherit:	{string} 	$cfname		configuration filename.
# @inherit:	{array}	$ForwardPort	list of SSH forwarding rules.
function check_ssh_forward_rules() {
	# workaround the lack of ${#ForwardPort[@]} support, no logical explaination
	for f in "${ForwardPort[@]}"; do (( rule_count++)); done

	# if (( ${#ForwardPort[@]} == 0 )); then
	if (( rule_count == 0 )); then
		feedback "ForwardPort array"  "empty"  "no value in $CONFIG_DIR/$cfname"
		return $ABORT_STATUS
	fi

	for fwd in "${ForwardPort[@]}"; do
		fwd="${fwd%%#*}"
		case "$fwd" in
			D\ *:*|R\ *:*:*:*|L\ *:*:*:*)
				forward_list+="-$fwd "
			;;
			*)
				feedback "$cfname"  "mal-formed"  "format $(_value "$fwd") isn't correct"
				return $ABORT_STATUS
			;;
		esac
	done

	return $SUCCESS_STATUS
}


# Check if pidfile already exists -- don't start another instance if pidfile exists
# @inherit:	{string} 	$cfname	configuration filename.
# @inherit:	{string} 	$pidfile		PID file for host.
function check_no_pid_exists() {
	# Define the pidfile variable for autossh (created by autossh)
	if [[ -e $pidfile ]]; then
		pidfile="$(_value "$pidfile")"
		feedback "${action}ing tunnel"  "forbidden"  "service already started (PID's file exists)"
		return $ABORT_STATUS
	fi

	return $SUCCESS_STATUS
}


# Before switching-users, make sure pidfile is created and user has write permission
# @inherit:	{string} 	$cfname	configuration filename.
function create_pid() {
	touch "$pidfile"

	# check to make sure pidfile was created
	if [[ ! -f $pidfile ]]; then
		feedback "$cfname's PID creation"  "aborted"  ""
		return $ABORT_STATUS
	fi

	return $SUCCESS_STATUS
}


# Kill process and clean related file
# @param:	{string}	$name		configuration name.
# @param:	{string}	$pidfile	process pid filepath.
function kill_and_clean() {
	name="$1"
	pidfile="$2"

	autossh_pid=$(cat "$pidfile")

	kill "$autossh_pid" &> /dev/null
	rm -f /var/lock/"$name"/*
	rm -f "$pidfile" # in case pidfile is empty
	kill -9 "$autossh_pid" &> /dev/null # some time kill -15 isn't enough
}


# Set-up transfert limitation command
# @inherit: 	{boolean}	$BandwidthLimitation
# @inherit: 	{integer}		$UploadLimit
# @inherit: 	{integer}		$DownloadLimit
function throttle() {
	throttle=()
	if [[ $BandwidthLimitation == true ]]; then
		throttle=(
			trickle
			-s
			-u ${UploadLimit:=$NO_TRANSFERT_LIMIT}
			-d ${DownloadLimit:=$NO_TRANSFERT_LIMIT}
           )
	fi
	echo "${throttle[@]}"
}

# - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
#                                              START | STOP | RESTART | STATUS
# - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

# START given configuration
# @param:	{string}	$config		configuration filepath.
# @inherit:	{string} 	$cfname	configuration filename.
function start() {
	local cfname="${1:-undef}"
	local config="$CONFIG_DIR/$cfname"
	local pidfile="$PID_DIR/$cfname.pid"
	local forward_list=""
	local autossh_logfile="$LOG_DIR/$NAME-$cfname.log"

	# abort start if one of the following fail
	check_config_file_exists "$cfname" && source "$config" || return $ABORT_STATUS
	check_tunnel_config                                                        || return $ABORT_STATUS
	export ForwardPort                                                          # loaded by check_config_file_exists(), required by check_ssh_forward_rules()
	check_ssh_forward_rules                                                 || return $ABORT_STATUS
	check_no_pid_exists                                                        || return $ABORT_STATUS
	create_pid                                                                       || return $ABORT_STATUS

	printf "Starting %s %s\n" "$(_info "$NAME")" "$(_value "$cfname")"

	# start autossh as the user defined in the config file
	# the pid file must be re-defined in the new environment
	autossh_env=(
		AUTOSSH_LOGFILE="$autossh_logfile"
		AUTOSSH_LOGLEVEL=7
		AUTOSSH_DEBUG=true
		AUTOSSH_PIDFILE="$pidfile"
		AUTOSSH_PORT=0
	)
	channel=(
		$autossh -q -f -N -p $RemotePort \
			-i "$IdentityFile" \
			-v \
			-o Compression="$Compression" \
			-o ServerAliveInterval="$ServerAliveInterval" \
			-o ServerAliveCountMax="$ServerAliveCountMax" \
			-o StrictHostKeyChecking="$StrictHostKeyChecking" \
		$forward_list "$RemoteUser@$RemoteHost"
      )

	touch "$pidfile" "$autossh_logfile"
	chown "$LocalUser":www-data "$pidfile"  "$autossh_logfile"
	sudo -u "$LocalUser" "${autossh_env[@]}" $(throttle) "${channel[@]}" # /!\ quoting 'throttle' provoke a "No such file or directory" error

	feedback "latency" "$(_warning waiting)" "wait a maximum of ${MAX_LATENCY}s before failing"
	i=0;
	while [[ ! -s $pidfile ]]; do sleep 1s; printf "."; (( i > MAX_LATENCY)) && break; (( i++)); done;

	if [[ -s $pidfile ]]; then
		touch /var/lock/"$NAME/$cfname"
		autossh_pid=$(cat "$pidfile")
		feedback "${action}ing tunnel"  "$(_valid 'done')"  "pid: $autossh_pid"
	else
		kill_and_clean "$NAME" "$pidfile"
		feedback "${action}ing tunnel"  "failed"  "empty pid: $pidfile"
		return $ABORT_STATUS
	fi

	return $SUCCESS_STATUS
}


# STOP given configuration
# @param:	{string}	$config		configuration filepath.
# @inherit:	{string} 	$cfname	configuration filename.
function stop() {
	local cfname="${1:-undef}"
	local config="$CONFIG_DIR/$cfname"
	local pidfile="$PID_DIR/$cfname.pid"
	local autossh_pid='undef' # see below

	printf "Stopping %s %s\n" "$(_info "$NAME")" "$(_value "$cfname")"

	# if no config names (on the command-line), stop all autossh processes
	if [[ ! -f $pidfile ]]; then
		feedback "${action}ping tunnel"  "$(_warning skipped)"  "already stopped"
	elif [[ -s $pidfile ]]; then
		kill_and_clean "$NAME" "$pidfile"
		feedback "${action}ping tunnel"  "$(_valid 'done')"  "pid: $autossh_pid"
	else
		kill_and_clean "$NAME" "$pidfile"
		feedback "${action}ping tunnel"  "failed"  "empty pid: $pidfile"
		return $ABORT_STATUS
	fi

	return $SUCCESS_STATUS
}


# Get STATUS for given configuration
# @param:	{string}	$config	configuration filepath.
# @inherit:	{string} 	$cfname	configuration filename.
function status() {
	local cfname="${1:-undef}"
	local config="$CONFIG_DIR/$cfname"
	local pidfile="$PID_DIR/$cfname.pid"
	local autossh_pid='undef' # see below

	check_config_file_exists "$cfname" || return $ABORT_STATUS

	if [[ -s $pidfile ]]; then
		autossh_pid=$(cat "$pidfile")
		# select (AutoSSH) parent process
		autossh_info=( $(ps --no-headers --pid "$autossh_pid" -o pid,etime) )
		channel_ports="$(ps --no-headers --pid "$autossh_pid" -o args | grep -z -oE -- ':[[:digit:]]+:' | tr -s ':\n' ',' | sed -e 's/^,//' -e 's/,$//')"
		# select children processes
		ssh_info="$(ps --no-headers --ppid "$autossh_pid" -o pid,args | grep -z -oE -- ':[[:digit:]]+:' | tr -s ':\n' ',' | sed -e 's/^,//' -e 's/,$//')"

		feedback "$cfname:autossh" 	"$(_valid "on")"  "pid: ${autossh_info[0]}, uptime: ${autossh_info[1]}"
		feedback "${cfname//?/ } ssh"  		"$(_valid "on")"  "port: ${ssh_info:-?}"
	else
		feedback "$cfname"  "off"  "service has not been started yet"
	fi

	return $SUCCESS_STATUS
}


# RESTART given configuration
# @param:	{string}	$config	configuration filepath.
# @inherit:	{string} 	$cfname	configuration filename.
function restart() {
	local cfname="${1:-undef}"
	stop "$cfname"
	start "$cfname"
}

# - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
#                                                    COMMAND & CONTROL
# - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

#  List available configuration in $CONFIG_DIR
function list_config() {
	config_list=()
	for config in $CONFIG_DIR/*; do
		config_list=( "${config_list[@]}" "$(basename "$config")" )
	done
	echo "${config_list[@]}"

	return $SUCCESS_STATUS
}


# Execute action on given configurations
# @param:	{array}	$@		list of configuration names
function iter_action_on_config() {
	local action="$1"; shift
	local cfname_list=( "$@" )

	for cfname in "${cfname_list[@]}"; do
		config="$CONFIG_DIR/$cfname"
		[[ $cfname == *template || -d $config || ! -f $config ]] && continue
		check_config_file_exists "$cfname" || continue
		"$action" "$cfname"
	done

	return $SUCCESS_STATUS
}


# Require superuser privileges to execute the service
function require_superuser() {
	if (( $(id -u) != 0 )); then
		printf "%s %s\n" "$(_error "Require")" "$(_info "sudo privileges")"
		return $ABORT_STATUS
	fi

	return $SUCCESS_STATUS
}

# Create required directories before running any action
function require_directories() {
	required_dirs=( "$LOG_DIR" "$CONFIG_DIR" "$PID_DIR" "$LOCK_DIR" )
	for dir in "${required_dirs[@]}"; do
		[[ ! -d "$dir" ]] && mkdir -p "$dir"
	done
}

# Execute script only when in standalone so we can include script for testing
# @param:	{array}	$@		command line argument
function run() {
	require_superuser  || exit $?
	require_directories

	# save the action name, and shift the command-line array
	# all remaining command-line arguments *should* be config names
	action="$1"
	shift

	case "$action" in
	start)
		# if no config is provided run all exisiting configs, otherwise only the specified
		if [[ -z "$1" ]]; then
			iter_action_on_config "stop" $(list_config)  # to get a clean env when `docker restart`
			iter_action_on_config "start" $(list_config)  # don't quote, we need word splitting
		else
			iter_action_on_config "start" "$@"
		fi
		;;
	stop)
		# if no config is provided run all exisiting configs, otherwise only the specified
		if [[ -z "$1" ]]; then
			iter_action_on_config "stop" $(list_config)  # don't quote, we need word splitting
		else
			iter_action_on_config "stop" "$@"
		fi
		;;
	restart)
		# if no config is provided run all exisiting configs, otherwise only the specified
		iter_action_on_config "restart" "$@"
		;;
	status)
		# if no config is provided run all exisiting configs, otherwise only the specified
		if [[ -z "$1" ]]; then
			iter_action_on_config "status" $(list_config)  # don't quote, we need word splitting
		else
			iter_action_on_config "status" "$@"
		fi
		;;
	*)
		printf "Usage: %s {start|stop|restart|status} {config names...}\n" "$0"
		;;
	esac
}

# When False, don't execute as the file is included for testing
[[ ! $TEST_MODE ]] && run "$@"