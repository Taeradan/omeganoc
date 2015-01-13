FROM debian

RUN export DEBIAN_FRONTEND=noninteractive
RUN export PERL_MM_USE_DEFAULT=true

# Add the official R repository to get R 3.0 (wheezy only has 2.x)
RUN sed -i '$ a\deb http://cran.univ-lyon1.fr/bin/linux/debian wheezy-cran3/' /etc/apt/sources.list
RUN apt-key adv --keyserver keys.gnupg.net --recv-key 381BA480

RUN apt-get -q update && apt-get -y -q install\
    automake\
    byacc\
    curl\
    flex\
    graphviz\
    libcurl4-openssl-dev\
    libgraphviz-dev\
    libtool\
    libxml2-dev\
    nagios-plugins\
    python-dev\
    python-pip\
    python-rrd\
    snmpd\
    unzip\
    vim

RUN useradd --user-group shinken
RUN useradd --user-group graphite
RUN pip install pycurl cherrypy shinken

# Configure snmpd
COPY vagrant_provision/snmpd.conf.template /etc/snmp/snmpd.conf
RUN service snmpd restart

# Configure PERL for the SNMP probes
RUN cpan install Net::SNMP

# Initialize Shinken
RUN shinken --init
RUN shinken install linux-snmp

# Fix a missing file in linux-snmp
COPY vagrant_provision/utils.pm.template /var/lib/shinken/libexec/utils.pm

# Configure Shinken
COPY vagrant_provision/broker-master.cfg.template /etc/shinken/brokers/broker-master.cfg
COPY vagrant_provision/localhost.cfg.template /etc/shinken/hosts/localhost.cfg
COPY vagrant_provision/livestatus.cfg.template /etc/shinken/modules/livestatus.cfg

# Launch the installer
# We do not use the "install" target as it will  install the on-reader lib by copying the files
# Instead we'll create links to directly manipulate the files during development
#### Non optimisé à partir d'ici
# Add the sources
COPY . /sources

WORKDIR /sources
RUN make install

# Auto start the carbon daemon on launch
COPY vagrant_provision/carbon.init.template /etc/init.d/carbon
RUN chmod 755 /etc/init.d/carbon
RUN update-rc.d carbon defaults

# Make the lib folder available globally for the shinken and vagrant users
RUN mkdir -p /home/shinken/.local/lib/python2.7/site-packages
RUN ln -s /sources/lib/on_reader/on_reader /home/shinken/.local/lib/python2.7/site-packages/on_reader
RUN chown -R shinken:shinken /home/shinken

# Start things up
RUN echo "/etc/init.d/carbon start" >> /run.sh
RUN echo "service shinken restart" >> /run.sh
RUN echo "tail -f /var/log/syslog" >> /run.sh
RUN chmod +x /run.sh

ENTRYPOINT /run.sh
